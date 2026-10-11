from pathlib import Path
import threading
import logging
import time

import numpy as np
import torch
from ultralytics import YOLO

from sadarakshak.constant.application import (
    MODEL_PATH, INFERENCE_IMGSZ, DISPLAY_CONFIDENCE, INFERENCE_DEVICE,
)

OPENVINO_DIR = MODEL_PATH.parent / f"{MODEL_PATH.stem}_openvino_model"


def _openvino_available() -> bool:
    try:
        import openvino  # noqa: F401
        return True
    except Exception:
        return False


class ModelTrainer:
    """Loads the trained YOLO11 accident model (model/best.pt) and runs inference.

    Inference engine selection (SADARAKSHAK_INFERENCE_DEVICE, default "auto"):
      auto      -> CUDA GPU if present, else OpenVINO on the Intel iGPU / NPU / CPU,
                   else PyTorch CPU. The OpenVINO model is an export of the SAME
                   best.pt weights (model/best_openvino_model/, created automatically).
      cpu|cuda  -> PyTorch on that device
      intel:gpu | intel:npu | intel:cpu -> OpenVINO on that device

    One instance is shared by every detection session; ``detect_objects`` is
    serialised with a lock because the Ultralytics predictor is not thread-safe.
    """

    def __init__(self, model_path=MODEL_PATH):
        self.model_path = Path(model_path)
        self._lock = threading.Lock()
        self.model = YOLO(str(self.model_path))  # PyTorch model (also used for class names)
        self.class_names = {int(k): v for k, v in self.model.names.items()}
        self.engine, self.device, self.infer_model = self._select_engine(INFERENCE_DEVICE)
        logging.info(f"Model loaded: {self.model_path.name} ({len(self.class_names)} classes) "
                     f"engine={self.engine} device={self.device} ~{self.warmup_ms:.0f} ms/inference")

    # ------------------------------------------------------------ engine selection
    def _try(self, model, device):
        """Warm up a candidate engine; returns average ms or raises."""
        dummy = np.zeros((360, 640, 3), dtype=np.uint8)
        for _ in range(2):
            model.predict(dummy, imgsz=INFERENCE_IMGSZ, device=device, verbose=False)
        t = time.time()
        for _ in range(3):
            model.predict(dummy, imgsz=INFERENCE_IMGSZ, device=device, verbose=False)
        return (time.time() - t) * 1000 / 3

    def _openvino_model(self):
        stale = OPENVINO_DIR.exists() and (OPENVINO_DIR / f"{self.model_path.stem}.xml").stat().st_mtime < self.model_path.stat().st_mtime
        if not OPENVINO_DIR.exists() or stale:
            logging.info("Exporting best.pt to OpenVINO (same weights, one-time)...")
            self.model.export(format="openvino", imgsz=INFERENCE_IMGSZ, dynamic=False, verbose=False)
            self.model = YOLO(str(self.model_path))  # export() leaves the torch model modified
        return YOLO(str(OPENVINO_DIR), task="detect")

    def _select_engine(self, wanted: str):
        wanted = (wanted or "auto").lower()
        candidates = []
        if wanted == "auto":
            if torch.cuda.is_available():
                candidates.append(("pytorch", "cuda"))
            if _openvino_available():
                candidates += [("openvino", "intel:gpu"), ("openvino", "intel:npu")]
            candidates.append(("pytorch", "cpu"))
        elif wanted.startswith("intel:"):
            candidates = [("openvino", wanted), ("pytorch", "cpu")]
        else:
            candidates = [("pytorch", wanted), ("pytorch", "cpu")]

        for engine, device in candidates:
            try:
                model = self._openvino_model() if engine == "openvino" else self.model
                if engine == "pytorch":
                    model.to(torch.device(device))
                self.warmup_ms = self._try(model, device)
                return engine, device, model
            except Exception as e:
                logging.warning(f"Inference engine {engine}/{device} unavailable: {type(e).__name__}: {e}")
        raise RuntimeError("No usable inference engine for the YOLO model")

    # ------------------------------------------------------------ inference
    def detect_objects(self, frame, conf=DISPLAY_CONFIDENCE):
        """Run YOLO on a BGR frame.

        Returns ``(boxes, class_ids, confidences)`` as numpy arrays, with boxes
        in ``xyxy`` pixel coordinates of the *input* frame. Ultralytics handles
        letterboxing to the training size (640) and maps boxes back.
        """
        with self._lock:
            results = self.infer_model.predict(
                frame,
                imgsz=INFERENCE_IMGSZ,
                conf=conf,
                device=self.device,
                verbose=False,
            )[0]
        boxes = results.boxes.xyxy.cpu().numpy()
        class_ids = results.boxes.cls.cpu().numpy().astype(np.int32)
        confidences = results.boxes.conf.cpu().numpy()
        return boxes, class_ids, confidences

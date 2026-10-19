from pathlib import Path
import threading
import logging
import time
import os

import numpy as np
import torch
from ultralytics import YOLO

from sadarakshak.constant.application import (
    MODEL_PATH, INFERENCE_IMGSZ, DISPLAY_CONFIDENCE, INFERENCE_DEVICE,
)
from sadarakshak.components.hardware_detector import get_hardware_diagnostics


class ModelTrainer:
    """Loads the trained YOLO11 accident model (model/best.pt) and runs hardware-aware inference.

    Features:
      - Automatic GPU detection and operational verification (PyTorch + CUDA)
      - Lowest-latency inference selection:
          * CUDA with FP16 half-precision on compatible NVIDIA GPUs
          * Thread-optimized CPU execution as safe fallback
      - Graceful error recovery: if GPU initialization fails, falls back to CPU
      - Thread-safe inference across all active sessions with a single model instance
      - Real performance telemetry (warmup ms, actual inference ms)
    """

    def __init__(self, model_path=MODEL_PATH):
        self.model_path = Path(model_path)
        self._lock = threading.Lock()
        self.hardware_info = get_hardware_diagnostics()

        logging.info("Initializing SADARAKSHAK YOLO11 detection engine...")
        self.model = YOLO(str(self.model_path))  # PyTorch model
        self.class_names = {int(k): v for k, v in self.model.names.items()}
        self.model_name = "YOLO11m"

        self.engine, self.device, self.device_type, self.accelerator, self.device_label, self.half, self.warmup_ms = (
            self._select_and_warmup_engine(INFERENCE_DEVICE)
        )

        logging.info(
            f"Engine Ready: model={self.model_name} ({len(self.class_names)} classes) "
            f"device={self.device} ({self.device_label}) "
            f"accelerator={self.accelerator} fp16={self.half} "
            f"warmup={self.warmup_ms:.1f}ms"
        )

    # ------------------------------------------------------------ engine selection
    def _try_warmup(self, device: str, use_half: bool) -> float:
        """Warm up the model on candidate device; returns average ms or raises."""
        dummy = np.zeros((360, 640, 3), dtype=np.uint8)
        kwargs = {"device": device, "verbose": False}
        if use_half:
            kwargs["half"] = True
        # Warmup passes
        for _ in range(2):
            self.model.predict(dummy, imgsz=INFERENCE_IMGSZ, **kwargs)
        # Timed passes
        t0 = time.time()
        for _ in range(3):
            self.model.predict(dummy, imgsz=INFERENCE_IMGSZ, **kwargs)
        return (time.time() - t0) * 1000 / 3

    def _select_and_warmup_engine(self, wanted: str):
        wanted = (wanted or "auto").strip().lower()
        hw = self.hardware_info
        selection = hw["selection"]

        candidates = []

        if wanted == "auto":
            # Priority 1: Operational CUDA GPU if available
            if hw["cuda"]["isOperational"]:
                candidates.append(("cuda:0", "NVIDIA GPU", "CUDA", f"NVIDIA {hw['cuda']['deviceName']}", True))
            # Priority 2: Safe CPU fallback
            candidates.append(("cpu", "CPU", "CPU", hw["cpu"]["name"], False))
        elif wanted.startswith("cuda"):
            candidates.append(("cuda:0", "NVIDIA GPU", "CUDA", f"NVIDIA {hw['cuda']['deviceName'] or 'GPU'}", True))
            candidates.append(("cpu", "CPU", "CPU", hw["cpu"]["name"], False))
        else:  # cpu
            candidates.append(("cpu", "CPU", "CPU", hw["cpu"]["name"], False))

        # Optimize CPU threads to prevent thread thrashing on hybrid multi-core CPUs
        cpu_threads = min(8, max(2, (hw["cpu"]["logicalCores"] or 4) // 2))
        try:
            torch.set_num_threads(cpu_threads)
        except Exception:
            pass

        last_error = None
        for dev, dev_type, accel, dev_label, use_half in candidates:
            try:
                logging.info(f"Testing inference candidate: device={dev} ({accel}, fp16={use_half})...")
                warmup = self._try_warmup(dev, use_half)
                return "pytorch", dev, dev_type, accel, dev_label, use_half, warmup
            except Exception as e:
                last_error = e
                logging.warning(f"Inference device '{dev}' failed initialization: {type(e).__name__}: {e}")
                # Record warning if GPU failed
                if "cuda" in dev:
                    self.hardware_info["selection"]["gpuStatus"] = "WARNING_FALLBACK"
                    self.hardware_info["selection"]["warning"] = f"GPU initialization failed ({e}). Reverted to CPU."

        # If all candidates fail, attempt bare CPU as emergency fallback
        try:
            logging.warning("All primary candidates failed; attempting bare CPU fallback...")
            warmup = self._try_warmup("cpu", False)
            return "pytorch", "cpu", "CPU", "CPU", hw["cpu"]["name"], False, warmup
        except Exception as e:
            raise RuntimeError(f"No usable inference engine available for YOLO model: {e}") from last_error

    # ------------------------------------------------------------ inference
    def detect_objects(self, frame, conf=DISPLAY_CONFIDENCE):
        """Run YOLO on a BGR frame with low latency.

        Returns ``(boxes, class_ids, confidences)`` as numpy arrays, with boxes
        in ``xyxy`` pixel coordinates of the *input* frame.
        """
        kwargs = {
            "imgsz": INFERENCE_IMGSZ,
            "conf": conf,
            "device": self.device,
            "verbose": False,
        }
        if self.half:
            kwargs["half"] = True
        with self._lock:
            results = self.model.predict(frame, **kwargs)[0]
        boxes = results.boxes.xyxy.cpu().numpy()
        class_ids = results.boxes.cls.cpu().numpy().astype(np.int32)
        confidences = results.boxes.conf.cpu().numpy()
        return boxes, class_ids, confidences

    # ------------------------------------------------------------ status & diagnostics
    def get_engine_info(self) -> dict:
        """Returns the current state and capabilities of the detection engine."""
        hw = self.hardware_info
        is_gpu = "cuda" in self.device
        return {
            "modelName": self.model_name,
            "modelPath": str(self.model_path.name),
            "device": self.device,
            "deviceType": self.device_type,
            "deviceLabel": self.device_label,
            "accelerator": self.accelerator,
            "isGpu": is_gpu,
            "halfPrecision": self.half,
            "warmupMs": round(self.warmup_ms, 1),
            "status": "READY",
            "gpuStatus": hw["selection"].get("gpuStatus", "CPU_ONLY"),
            "warning": hw["selection"].get("warning"),
            "classesCount": len(self.class_names),
            "classes": self.class_names,
            "hardwareSummary": {
                "cpu": f"{hw['cpu']['name']} ({hw['cpu']['logicalCores']} cores)",
                "gpu": hw["primaryGpu"]["name"],
                "cudaOperational": hw["cuda"]["isOperational"],
                "cudaReason": hw["cuda"].get("failureReason"),
            }
        }

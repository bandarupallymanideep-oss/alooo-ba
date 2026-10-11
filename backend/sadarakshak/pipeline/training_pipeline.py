"""Offline (file / bounded stream) accident detection.

``TrainingPipeline`` keeps its historical name and public methods
(``process_frame``, ``process_video``, ``process_live_feed``, ``reset_state``)
but now delegates to the shared :class:`AccidentDetector`, so offline
analysis and live monitoring use one identical detection pipeline.
Accident footage is written to ``backend/detected_accidents`` (never to
``accident_clips``, which holds the original test videos).
"""
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, Optional

import cv2

from sadarakshak.components.model_trainer import ModelTrainer
from sadarakshak.components.accident_detector import (
    AccidentDetector, ACCIDENT_CLASS_IDS, CLASS_NAMES, downscale,
)
from sadarakshak.components.accident_store import AccidentStore, accident_store
from sadarakshak.components.stream_utils import open_capture, is_stream_url, mask_url
from sadarakshak.components.video_writer import VideoClipWriter
from sadarakshak.constant.application import BASE_DIR, ACCIDENT_IMAGES_DIR, CONFIDENCE_THRESHOLD
from sadarakshak.logger import logging


class TrainingPipeline:
    CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD
    ACCIDENT_CLASS_IDS = ACCIDENT_CLASS_IDS
    CLASS_NAMES = CLASS_NAMES
    BASE_DIR = BASE_DIR
    ACCIDENT_IMAGES_DIR = ACCIDENT_IMAGES_DIR

    def __init__(self, model_trainer: Optional[ModelTrainer] = None, store: AccidentStore = accident_store):
        self.model_trainer = model_trainer or ModelTrainer()
        self.store = store
        self.accident_detected_in_video = False

    def reset_state(self):
        """Kept for backward compatibility - every run now creates a fresh detector."""
        self.accident_detected_in_video = False

    # ------------------------------------------------------------ single image
    def process_frame(self, frame, save_image=True):
        boxes, class_ids, confidences = self.model_trainer.detect_objects(frame)
        accident_indices = [i for i, (c, s) in enumerate(zip(class_ids, confidences))
                            if int(c) in self.ACCIDENT_CLASS_IDS and s >= self.CONFIDENCE_THRESHOLD]
        accident_detected = bool(accident_indices)
        if accident_detected and save_image:
            snap = frame.copy()
            for i in accident_indices:
                x1, y1, x2, y2 = map(int, boxes[i])
                cv2.rectangle(snap, (x1, y1), (x2, y2), (0, 0, 255), 3)
            name = f"accident_image_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
            cv2.imwrite(str(self.ACCIDENT_IMAGES_DIR / name), snap)
        return "Accident detected" if accident_detected else "No accident detected"

    # ------------------------------------------------------------ video / bounded stream
    def process_video(self, video_path, output_path=None, save_annotated=True, camera: Optional[Dict] = None,
                      detect_every: int = 2, max_frames: Optional[int] = None,
                      progress_cb: Optional[Callable[[int, int], None]] = None,
                      on_event: Optional[Callable[[str, Dict], None]] = None,
                      source_type: str = "file") -> Dict:
        """Run accident detection over a whole video (or the first ``max_frames`` of a stream).

        Every frame is annotated; YOLO runs on every ``detect_every``-th frame.
        Accidents are saved automatically as detected_accidents/accidentN.mp4.
        If ``save_annotated`` is true the full annotated video is also written to ``output_path``.
        """
        self.reset_state()
        src = str(video_path)
        label = mask_url(src) if is_stream_url(src) else Path(src).name
        cap = open_capture(src)
        if not cap.isOpened():
            raise FileNotFoundError(f"Could not open video source: {label}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        if not 1.0 <= fps <= 60.0:
            fps = 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if max_frames:
            total_frames = min(total_frames, max_frames) if total_frames > 0 else max_frames
        detect_every = max(1, int(detect_every))

        detector = AccidentDetector(fps=fps, camera=camera or {"name": label, "location": "Offline analysis"},
                                    store=self.store, on_event=on_event, source_label=label,
                                    source_type=source_type, session_id=None)

        if output_path is None:
            output_path = self.BASE_DIR / "output_annotated.mp4"
        output_path = Path(output_path)
        writer = None
        frame_index, accident_inferences, snapshots = 0, 0, []
        started = time.time()
        try:
            while True:
                if max_frames and frame_index >= max_frames:
                    break
                ok, frame = cap.read()
                if not ok or frame is None:
                    break
                frame = downscale(frame)
                if frame_index % detect_every == 0:
                    boxes, class_ids, confs = self.model_trainer.detect_objects(frame)
                    detector.update_detections(boxes, class_ids, confs, frame_index=frame_index + 1)
                    if detector.accident_in_last_inference:
                        accident_inferences += 1
                annotated = detector.process_frame(frame)
                frame_index += 1
                if save_annotated:
                    if writer is None:
                        writer = VideoClipWriter(output_path, fps, annotated.shape[1], annotated.shape[0])
                    writer.write(annotated)
                if progress_cb and frame_index % 30 == 0:
                    progress_cb(frame_index, total_frames)
        finally:
            cap.release()
            detector.close()
            if writer is not None:
                writer.close()
                logging.info(f"Annotated output video saved to: {output_path}")

        accidents = detector.saved_records
        for rec in accidents:
            snapshots.append(str(self.store.snapshot_path(rec["id"])))
        self.accident_detected_in_video = bool(accidents)
        result_str = "Accident detected" if accidents else "No accident detected"
        return {
            "status": "success",
            "result": result_str,
            "accident_detected": bool(accidents),
            "total_frames": frame_index,
            "accident_frames": accident_inferences,
            "inferences": detector.inferences,
            "fps": round(fps, 2),
            "processing_seconds": round(time.time() - started, 1),
            "input_video": label,
            "output_video": str(output_path) if save_annotated else "",
            "saved_images": snapshots,
            "saved_clips": [str(self.store.clip_path(r["id"])) for r in accidents],
            "accidents": accidents,
        }

    def process_live_feed(self, url, max_frames: int = 1000):
        res = self.process_video(url, save_annotated=False, max_frames=max_frames, source_type="rtsp")
        return res["result"]

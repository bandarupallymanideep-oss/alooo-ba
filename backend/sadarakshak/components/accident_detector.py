"""The single SADARAKSHAK accident detection engine.

Used by live RTSP sessions, uploaded videos, sample clips, the legacy
endpoints and ``run_backend_test.py`` so there is exactly one detection
pipeline::

    frame --> YOLO11 (ModelTrainer.detect_objects) --> update_detections()
      |                                                    | accident class >= threshold
      v                                                    v in MIN_HITS of HIT_WINDOW inferences
    process_frame(): draw boxes, keep pre-accident buffer --> start event:
        reserve accidentN, save accidentN.jpg, write buffer + frames to accidentN.mp4
        ... until no accident for POST_ACCIDENT_SECONDS (or MAX_CLIP_SECONDS) --> accidentN.json

Inference and frame handling are decoupled so a live stream can be rendered and
recorded at full frame rate while YOLO runs as fast as the hardware allows.
"""
import threading
import time
from collections import Counter, deque
from datetime import datetime, timezone
from typing import Callable, Dict, Optional

import cv2
import numpy as np

from sadarakshak.constant.application import (
    CONFIDENCE_THRESHOLD, DISPLAY_CONFIDENCE, MIN_ACCIDENT_HITS, CONFIRM_WINDOW_S, MIN_HIT_RATIO,
    PRE_ACCIDENT_SECONDS, POST_ACCIDENT_SECONDS, MAX_CLIP_SECONDS, COOLDOWN_SECONDS,
    MAX_FRAME_WIDTH, MJPEG_QUALITY, REQUIRE_ROAD_CONTEXT,
)
from sadarakshak.components.accident_store import AccidentStore, accident_store, utc_now_iso
from sadarakshak.components.categories import category_for, category_label
from sadarakshak.components.video_writer import AsyncClipWriter
from sadarakshak.logger import logging

# Class ids verified against model/best.pt (model.names).
CLASS_NAMES = {
    0: "bike", 1: "bike_bike_accident", 2: "bike_object_accident", 3: "bike_person_accident",
    4: "car", 5: "car_bike_accident", 6: "car_car_accident", 7: "car_object_accident",
    8: "car_person_accident", 9: "person",
}
ACCIDENT_CLASS_IDS = {1, 2, 3, 5, 6, 7, 8}
VEHICLE_CLASS_IDS = {0, 4}
ROAD_CONTEXT_CLASS_IDS = {0, 4, 9}  # bike, car, person

COLLISION_LABELS = {
    "bike_bike_accident": ("Bike-Bike Collision", 2),
    "bike_object_accident": ("Bike-Object Collision", 1),
    "bike_person_accident": ("Bike-Pedestrian Collision", 1),
    "car_bike_accident": ("Car-Bike Collision", 2),
    "car_car_accident": ("Car-Car Collision", 2),
    "car_object_accident": ("Car-Object Collision", 1),
    "car_person_accident": ("Car-Pedestrian Collision", 1),
}

COLOR_ACCIDENT = (0, 0, 255)
COLOR_CAR = (0, 200, 0)
COLOR_BIKE = (0, 165, 255)
COLOR_PERSON = (255, 200, 0)


def downscale(frame: np.ndarray, max_width: int = MAX_FRAME_WIDTH) -> np.ndarray:
    h, w = frame.shape[:2]
    if w > max_width:
        frame = cv2.resize(frame, (max_width, int(h * max_width / w)), interpolation=cv2.INTER_AREA)
    return frame


def severity_for(class_name: str, confidence: float) -> str:
    if "person" in class_name:
        return "Critical"
    if confidence >= 0.9:
        return "High"
    return "Moderate"


class AccidentDetector:
    def __init__(self, fps: float, camera: Optional[Dict] = None, store: AccidentStore = accident_store,
                 on_event: Optional[Callable[[str, Dict], None]] = None, session_id: Optional[str] = None,
                 source_label: str = "", source_type: str = "rtsp",
                 confidence_threshold: float = CONFIDENCE_THRESHOLD):
        self.camera = camera or {}
        self.store = store
        self.on_event = on_event
        self.session_id = session_id
        self.source_label = source_label
        self.source_type = source_type
        self.conf_threshold = confidence_threshold
        self._lock = threading.RLock()

        self.fps = 25.0
        self.pre_buffer = deque(maxlen=1)
        self.set_fps(fps)

        self.frame_index = 0
        self.last_jpeg: Optional[bytes] = None
        self.last_jpeg_captured_at: float = 0.0  # wall-clock time the frame was captured/decoded
        self.last_process_ms: float = 0.0        # annotate + JPEG encode (+ clip write) time
        self.last_frame_size = None

        # latest inference result (drawn on every frame until the next inference)
        self._boxes = np.empty((0, 4))
        self._class_ids = np.empty((0,), dtype=np.int32)
        self._confs = np.empty((0,))
        self._hit_log = deque()  # (frame_index, hit) within the confirmation window
        self.inferences = 0
        self.accident_in_last_inference = False
        self.last_accident_conf = 0.0

        # event state
        self.active: Optional[Dict] = None
        self._writer: Optional[VideoClipWriter] = None
        self._pending_start = False
        self._last_hit_frame = -10 ** 9
        self._event_frames = 0
        self._event_hits = 0
        self._event_classes: Counter = Counter()
        self._event_best = (None, 0.0)  # (class_name, conf)
        self._cooldown_left = 0
        self.saved_records = []

    # ------------------------------------------------------------ config
    def set_fps(self, fps: float):
        fps = float(fps) if fps and 1.0 <= float(fps) <= 60.0 else 25.0
        with self._lock:
            self.fps = fps
            maxlen = max(1, int(PRE_ACCIDENT_SECONDS * fps))
            if self.pre_buffer.maxlen != maxlen:
                self.pre_buffer = deque(self.pre_buffer, maxlen=maxlen)

    @property
    def is_recording(self) -> bool:
        return self.active is not None

    # ------------------------------------------------------------ inference results
    def update_detections(self, boxes, class_ids, confidences, frame_index: Optional[int] = None):
        """Feed one YOLO result. ``frame_index`` = index of the frame that was inferred."""
        with self._lock:
            self._boxes = np.asarray(boxes).reshape(-1, 4)
            self._class_ids = np.asarray(class_ids).astype(np.int32)
            self._confs = np.asarray(confidences)
            self.inferences += 1

            best_name, best_conf = None, 0.0
            for cid, conf in zip(self._class_ids, self._confs):
                if int(cid) in ACCIDENT_CLASS_IDS and conf >= self.conf_threshold and conf > best_conf:
                    best_name, best_conf = CLASS_NAMES.get(int(cid), str(cid)), float(conf)
            if best_name is not None and REQUIRE_ROAD_CONTEXT and not any(
                    int(cid) in ROAD_CONTEXT_CLASS_IDS and conf >= DISPLAY_CONFIDENCE
                    for cid, conf in zip(self._class_ids, self._confs)):
                best_name, best_conf = None, 0.0  # no vehicle/person in view: not a road accident
            hit = best_name is not None
            idx = self.frame_index if frame_index is None else frame_index
            self._hit_log.append((idx, hit))
            window_frames = CONFIRM_WINDOW_S * self.fps
            while self._hit_log and idx - self._hit_log[0][0] > window_frames:
                self._hit_log.popleft()
            recent_hits = sum(1 for _, h in self._hit_log if h)
            confirmed = recent_hits >= MIN_ACCIDENT_HITS and recent_hits / len(self._hit_log) >= MIN_HIT_RATIO
            self.accident_in_last_inference = hit
            self.last_accident_conf = best_conf
            if hit:
                self._last_hit_frame = self.frame_index if frame_index is None else frame_index
                if self.active is not None:
                    self._event_hits += 1
                    self._event_classes[best_name] += 1
                    if best_conf > self._event_best[1]:
                        self._event_best = (best_name, best_conf)
                elif confirmed and self._cooldown_left <= 0:
                    self._pending_start = True
                    self._event_classes[best_name] += 1
                    if best_conf > self._event_best[1]:
                        self._event_best = (best_name, best_conf)

    # ------------------------------------------------------------ drawing
    def annotate(self, frame: np.ndarray) -> np.ndarray:
        out = frame.copy()
        for box, cid, conf in zip(self._boxes, self._class_ids, self._confs):
            if conf < DISPLAY_CONFIDENCE:
                continue
            cid = int(cid)
            x1, y1, x2, y2 = map(int, box)
            is_acc = cid in ACCIDENT_CLASS_IDS
            color = COLOR_ACCIDENT if is_acc else COLOR_CAR if cid == 4 else COLOR_BIKE if cid == 0 else COLOR_PERSON
            cv2.rectangle(out, (x1, y1), (x2, y2), color, 3 if is_acc else 2)
            label = f"{CLASS_NAMES.get(cid, cid)} {conf:.2f}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            ty = max(y1, th + 8)
            cv2.rectangle(out, (x1, ty - th - 8), (x1 + tw + 6, ty), color, -1)
            cv2.putText(out, label, (x1 + 3, ty - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

        h, w = out.shape[:2]
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cam = self.camera.get("name") or "SADARAKSHAK"
        if self.active is not None:
            text, color = f"ACCIDENT DETECTED  [{self.active['id']}  REC]", (0, 0, 200)
        else:
            text, color = "MONITORING", (40, 40, 40)
        banner = f"SADARAKSHAK | {cam} | {ts} | {text}"
        scale = 0.5 if w < 900 else 0.65
        (tw, th), _ = cv2.getTextSize(banner, cv2.FONT_HERSHEY_SIMPLEX, scale, 2)
        cv2.rectangle(out, (0, 0), (min(w, tw + 20), th + 18), color, -1)
        cv2.putText(out, banner, (10, th + 9), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), 2)
        return out

    # ------------------------------------------------------------ per frame
    def process_frame(self, frame: np.ndarray, captured_at: Optional[float] = None) -> np.ndarray:
        """Annotate a frame and advance the recording state machine. Returns the annotated frame."""
        captured_at = captured_at or time.time()
        with self._lock:
            self.frame_index += 1
            if self._cooldown_left > 0:
                self._cooldown_left -= 1
            just_started = False
            if self._pending_start and self.active is None:
                self._pending_start = False
                just_started = self._start_event(frame)
            annotated = self.annotate(frame)
            ok, jpg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, MJPEG_QUALITY])
            jpeg = jpg.tobytes() if ok else None
            self.last_jpeg = jpeg
            self.last_jpeg_captured_at = captured_at
            self.last_process_ms = (time.time() - captured_at) * 1000
            self.last_frame_size = (annotated.shape[1], annotated.shape[0])
            if just_started:
                cv2.imwrite(str(self.store.snapshot_path(self.active["id"])), annotated,
                            [cv2.IMWRITE_JPEG_QUALITY, 92])
                self._emit("accident_started", self.active)

            if self.active is not None:
                self._write(annotated)
                self._event_frames += 1
                no_hit_frames = self.frame_index - self._last_hit_frame
                if (no_hit_frames > POST_ACCIDENT_SECONDS * self.fps
                        or self._event_frames >= MAX_CLIP_SECONDS * self.fps):
                    self._finish_event()
            elif jpeg is not None:
                self.pre_buffer.append(jpeg)
            return annotated

    # ------------------------------------------------------------ events
    def _write(self, frame):
        try:
            # copy: the caller may reuse the array while the writer thread encodes it
            self._writer.write(frame if isinstance(frame, bytes) else frame.copy())
        except Exception as e:
            logging.error(f"Error writing accident clip: {e}")

    def _start_event(self, frame: np.ndarray) -> bool:
        """Reserve accidentN, open the clip writer and flush the pre-accident buffer.

        The caller annotates the current frame afterwards (so it shows the
        ACCIDENT banner), saves it as the snapshot and emits ``accident_started``.
        """
        accident_id = self.store.reserve_id()
        clip_path = self.store.clip_path(accident_id)
        h, w = frame.shape[:2]
        try:
            self._writer = AsyncClipWriter(clip_path, self.fps, w, h)
        except Exception as e:
            logging.error(f"Cannot create accident clip {clip_path.name}: {e}")
            self._writer = None
            clip_path.unlink(missing_ok=True)  # release the reserved name
            return False
        for jpeg in self.pre_buffer:  # footage leading up to the accident (decoded on the writer thread)
            self._write(jpeg)
        pre_frames = len(self.pre_buffer)
        self.pre_buffer.clear()

        class_name, conf = self._event_best
        class_name = class_name or "accident"
        label, vehicles = COLLISION_LABELS.get(class_name, ("Road Accident", 1))
        cam = self.camera
        record = {
            "id": accident_id,
            "cameraId": cam.get("id") or self.session_id or "adhoc",
            "cameraName": cam.get("name") or "Ad-hoc source",
            "location": cam.get("location") or "Unknown location",
            "latitude": cam.get("latitude"),
            "longitude": cam.get("longitude"),
            "sessionId": self.session_id,
            "sourceType": self.source_type,
            "source": self.source_label,  # already credential-masked by the caller
            "timestamp": utc_now_iso(),
            "videoOffsetSeconds": round(max(0, self.frame_index - 1) / self.fps, 2) if self.source_type != "rtsp" else None,
            "accidentType": class_name,
            "category": category_for(class_name),
            "categoryLabel": category_label(category_for(class_name)),
            "collisionType": label,
            "vehiclesInvolved": vehicles,
            "confidence": round(conf, 4),
            "confidenceScore": round(conf * 100, 1),
            "severity": severity_for(class_name, conf),
            "status": "New",
            "recording": True,
            "clipFile": clip_path.name,
            "videoClipUrl": f"/detected_accidents/{clip_path.name}",
            "snapshotUrl": f"/detected_accidents/{self.store.snapshot_path(accident_id).name}",
            "preAccidentFrames": pre_frames,
            "fps": round(self.fps, 2),
            "model": "YOLO11m (model/best.pt)",
            "confidenceThreshold": self.conf_threshold,
            "notes": "",
        }
        self.store.save(record)
        self.active = record
        self._event_frames = 0
        self._event_hits = sum(1 for _, h in self._hit_log if h)
        logging.info(f"ACCIDENT DETECTED -> {accident_id} ({class_name} {conf:.2f}) camera='{record['cameraName']}'")
        return True

    def _finish_event(self):
        rec, writer = self.active, self._writer
        self.active, self._writer = None, None
        if rec is None:
            return
        if writer is not None:
            writer.close()
        class_name, conf = self._event_best
        if self._event_classes:
            class_name = self._event_classes.most_common(1)[0][0]
        label, vehicles = COLLISION_LABELS.get(class_name or "", (rec["collisionType"], rec["vehiclesInvolved"]))
        rec.update({
            "recording": False,
            "endedAt": utc_now_iso(),
            "accidentType": class_name or rec["accidentType"],
            "category": category_for(class_name or rec["accidentType"]),
            "categoryLabel": category_label(category_for(class_name or rec["accidentType"])),
            "collisionType": label,
            "vehiclesInvolved": vehicles,
            "confidence": round(conf, 4),
            "confidenceScore": round(conf * 100, 1),
            "severity": severity_for(class_name or "", conf),
            "detectionHits": self._event_hits,
            "clipFrames": writer.frames_written if writer else 0,
            "durationSeconds": writer.duration_seconds if writer else 0,
            "encoder": writer.backend if writer else None,
            "clipSizeBytes": self.store.clip_path(rec["id"]).stat().st_size,
        })
        self.store.save(rec)
        self.saved_records.append(rec)
        self._cooldown_left = int(COOLDOWN_SECONDS * self.fps)
        self._event_classes = Counter()
        self._event_best = (None, 0.0)
        self._hit_log.clear()
        logging.info(f"Accident footage saved: {rec['clipFile']} ({rec['durationSeconds']}s, {rec['clipFrames']} frames)")
        self._emit("accident_saved", rec)

    def close(self):
        """Finalize any in-progress accident clip (stream ended / stopped)."""
        with self._lock:
            if self.active is not None:
                self._finish_event()

    def _emit(self, kind: str, record: Dict):
        if self.on_event:
            try:
                self.on_event(kind, dict(record))
            except Exception as e:
                logging.error(f"on_event callback failed: {e}")

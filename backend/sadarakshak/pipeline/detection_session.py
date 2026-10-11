"""Live detection sessions (RTSP cameras and uploaded / sample videos).

Each session runs two threads::

    capture thread : RTSP/file -> OpenCV frames -> AccidentDetector.process_frame()
                     (annotate + record + latest JPEG for the MJPEG stream)
    inference thread: always takes the NEWEST frame -> YOLO11 -> update_detections()

so the browser sees smooth video even though YOLO on a CPU runs at a few FPS,
and an RTSP stream is never allowed to lag behind real time.

States: connecting -> connected -> detecting <-> accident
        -> reconnecting / disconnected / error / completed / stopped
"""
import threading
import time
import uuid
from collections import deque
from typing import Callable, Dict, List, Optional

import cv2
import numpy as np

from sadarakshak.components.accident_detector import AccidentDetector, downscale
from sadarakshak.components.accident_store import AccidentStore, accident_store, utc_now_iso
from sadarakshak.components.model_trainer import ModelTrainer
from sadarakshak.components.stream_utils import open_capture, mask_url, is_stream_url
from sadarakshak.constant.application import RECONNECT_ATTEMPTS, RECONNECT_DELAY_S
from sadarakshak.logger import logging

ACTIVE_STATES = {"connecting", "connected", "detecting", "accident", "reconnecting"}


class DetectionSession:
    def __init__(self, session_id: str, source: str, model: ModelTrainer, camera: Optional[Dict] = None,
                 store: AccidentStore = accident_store, source_type: Optional[str] = None,
                 on_event: Optional[Callable[[str, Dict], None]] = None,
                 on_first_frame: Optional[Callable[[np.ndarray], None]] = None):
        self.id = session_id
        self._source = source  # may contain credentials - never expose
        self.is_stream = is_stream_url(source)
        self.source_type = source_type or ("rtsp" if self.is_stream else "file")
        self.source_label = mask_url(source) if self.is_stream else source.replace("\\", "/").split("/")[-1]
        self.model = model
        self.camera = dict(camera or {})
        self.camera.setdefault("id", session_id)
        self.camera.setdefault("name", self.source_label)
        self.on_first_frame = on_first_frame
        self._external_on_event = on_event

        self.detector = AccidentDetector(fps=25.0, camera=self.camera, store=store, on_event=self._on_event,
                                         session_id=session_id, source_label=self.source_label,
                                         source_type=self.source_type)
        self.state = "connecting"
        self.message = "Connecting to video source..."
        self.error: Optional[Dict] = None
        self.started_at = utc_now_iso()
        self.ended_at: Optional[str] = None
        self.frames = 0
        self.total_frames = 0
        self.resolution: Optional[str] = None
        self.source_fps: Optional[float] = None
        self.capture_fps = 0.0
        self.inference_fps = 0.0
        self.inference_ms = 0.0
        self.reconnect_attempts = 0
        self.accident_ids: List[str] = []
        self.last_accident: Optional[Dict] = None
        self.frame_seq = 0
        self._raw_frame: Optional[np.ndarray] = None
        # measured latencies (ms, rolling windows) - see status()["latency"]
        self._lat_pipeline = deque(maxlen=60)   # frame decoded -> annotated JPEG ready
        self._lat_delivery = deque(maxlen=60)   # frame decoded -> JPEG handed to a browser stream
        self._lat_detection = deque(maxlen=20)  # frame decoded -> YOLO result applied

        self._stop = threading.Event()
        self._cond = threading.Condition()
        self._pending = None  # (frame, frame_index) awaiting inference
        self._capture_thread = threading.Thread(target=self._capture_loop, name=f"capture-{session_id}", daemon=True)
        self._infer_thread = threading.Thread(target=self._inference_loop, name=f"infer-{session_id}", daemon=True)

    # ------------------------------------------------------------ lifecycle
    def start(self):
        logging.info(f"[session {self.id}] starting on {self.source_label}")
        self._capture_thread.start()
        self._infer_thread.start()
        return self

    def stop(self, reason: str = "Stopped by user"):
        if self.is_active:
            self._set_state("stopped", reason)
        self._stop.set()
        with self._cond:
            self._cond.notify_all()

    def join(self, timeout: float = None):
        self._capture_thread.join(timeout)
        self._infer_thread.join(timeout)

    @property
    def is_active(self) -> bool:
        return self.state in ACTIVE_STATES and not self._stop.is_set()

    def _set_state(self, state: str, message: str = ""):
        if self.state == "stopped" and state != "stopped":
            return
        if state != self.state:
            logging.info(f"[session {self.id}] {self.state} -> {state}: {message}")
        self.state = state
        self.message = message
        if state in ("error", "completed", "stopped", "disconnected") and not self.ended_at:
            self.ended_at = utc_now_iso()

    def _on_event(self, kind: str, record: Dict):
        if kind == "accident_started":
            self.accident_ids.append(record["id"])
        self.last_accident = record
        if self._external_on_event:
            self._external_on_event(kind, record)

    # ------------------------------------------------------------ frames for the browser
    def get_jpeg(self, annotated: bool = True):
        """Latest frame as JPEG: (bytes, sequence number, capture time)."""
        captured_at = self.detector.last_jpeg_captured_at
        if annotated:
            return self.detector.last_jpeg, self.frame_seq, captured_at
        frame = self._raw_frame
        if frame is None:
            return None, self.frame_seq, captured_at
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return (buf.tobytes() if ok else None), self.frame_seq, captured_at

    def note_delivery(self, captured_at: float):
        """Called by the MJPEG endpoint when a frame is sent to a browser."""
        if captured_at:
            self._lat_delivery.append((time.time() - captured_at) * 1000)

    # ------------------------------------------------------------ threads
    def _inference_loop(self):
        times, done_at = [], deque(maxlen=30)
        while not self._stop.is_set():
            with self._cond:
                while self._pending is None and not self._stop.is_set():
                    self._cond.wait(0.5)
                if self._stop.is_set():
                    break
                frame, idx, captured_at = self._pending
                self._pending = None
            t0 = time.time()
            try:
                boxes, class_ids, confs = self.model.detect_objects(frame)
                self.detector.update_detections(boxes, class_ids, confs, frame_index=idx)
                self._lat_detection.append((time.time() - captured_at) * 1000)
            except Exception as e:
                logging.error(f"[session {self.id}] inference error: {e}")
                time.sleep(0.2)
                continue
            now = time.time()
            times.append(now - t0)
            times = times[-20:]
            self.inference_ms = round(1000 * sum(times) / len(times), 1)
            done_at.append(now)
            span = done_at[-1] - done_at[0]
            self.inference_fps = round((len(done_at) - 1) / span, 2) if span > 0 else 0.0  # inferences actually run per second

    def _capture_loop(self):
        try:
            self._run_capture()
        except Exception as e:
            logging.exception(f"[session {self.id}] capture crashed: {e}")
            self.error = {"code": "INTERNAL_ERROR", "message": "Detection stopped because of an internal error."}
            self._set_state("error", self.error["message"])
        finally:
            self.detector.close()
            self._stop.set()
            with self._cond:
                self._cond.notify_all()
            logging.info(f"[session {self.id}] ended ({self.state}); accidents={self.accident_ids}")

    def _run_capture(self):
        first_frame_done = False
        while not self._stop.is_set():
            cap = open_capture(self._source)
            if not cap.isOpened():
                cap.release()
                if not self.is_stream:
                    self.error = {"code": "OPEN_FAILED", "message": f"Unable to open video '{self.source_label}'."}
                    self._set_state("error", self.error["message"])
                    return
                if not self._wait_reconnect("Unable to connect to RTSP stream."):
                    return
                continue

            fps = cap.get(cv2.CAP_PROP_FPS) or 0
            self.source_fps = round(fps, 2) if 1 <= fps <= 60 else None
            self.detector.set_fps(fps if 1 <= fps <= 60 else 25.0)
            if not self.is_stream:
                self.total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            frame_interval = 1.0 / (self.source_fps or 25.0)
            t_start, n_local, stamps = time.time(), 0, []
            got_frame = False

            while not self._stop.is_set():
                ok, frame = cap.read()
                captured_at = time.time()
                if not ok or frame is None:
                    break
                if not got_frame:
                    got_frame = True
                    self.reconnect_attempts = 0
                    self.error = None
                    self._set_state("connected", "Receiving video frames")
                frame = downscale(frame)
                if not first_frame_done:
                    first_frame_done = True
                    self.resolution = f"{frame.shape[1]}x{frame.shape[0]}"
                    if self.on_first_frame:
                        try:
                            self.on_first_frame(frame)
                        except Exception as e:
                            logging.warning(f"[session {self.id}] thumbnail callback failed: {e}")

                # hand the newest frame to YOLO (an older, not yet inferred frame is dropped)
                with self._cond:
                    self._pending = (frame, self.detector.frame_index + 1, captured_at)
                    self._cond.notify()

                self.detector.process_frame(frame, captured_at=captured_at)
                self._lat_pipeline.append(self.detector.last_process_ms)
                self._raw_frame = frame
                self.frames += 1
                self.frame_seq += 1
                n_local += 1

                now = time.time()
                stamps.append(now)
                stamps = stamps[-60:]
                if len(stamps) > 1:
                    self.capture_fps = round((len(stamps) - 1) / (stamps[-1] - stamps[0] + 1e-6), 2)
                    # streams that report no/bogus FPS: use the measured rate for clip timing
                    if self.is_stream and self.source_fps is None and n_local == 60:
                        self.detector.set_fps(self.capture_fps)

                if self.detector.is_recording:
                    self._set_state("accident", f"ACCIDENT DETECTED - recording {self.detector.active['id']}")
                elif self.detector.inferences > 0:
                    self._set_state("detecting", "YOLO11 accident detection running")

                if not self.is_stream:  # play files at real-time speed, like a camera
                    delay = t_start + n_local * frame_interval - time.time()
                    if delay > 0:
                        time.sleep(delay)
            cap.release()
            self.detector.close()  # finalize a clip interrupted by a disconnect / end of file

            if self._stop.is_set():
                return
            if not self.is_stream:
                if got_frame:
                    self._set_state("completed", f"Video finished - {len(self.accident_ids)} accident(s) detected")
                else:
                    self.error = {"code": "NO_FRAMES", "message": "The video contains no readable frames."}
                    self._set_state("error", self.error["message"])
                return
            msg = "Stream disconnected: no more video frames received." if got_frame else \
                "Connected but no video frames were received."
            if not self._wait_reconnect(msg):
                return

    def _wait_reconnect(self, message: str) -> bool:
        self.reconnect_attempts += 1
        if self.reconnect_attempts > RECONNECT_ATTEMPTS:
            code = "STREAM_DISCONNECTED" if self.frames else "CONNECTION_FAILED"
            self.error = {"code": code, "message": f"{message} Gave up after {RECONNECT_ATTEMPTS} reconnection attempts."}
            self._set_state("disconnected" if self.frames else "error", self.error["message"])
            return False
        self.error = {"code": "RECONNECTING", "message": message}
        self._set_state("reconnecting", f"{message} Reconnecting ({self.reconnect_attempts}/{RECONNECT_ATTEMPTS})...")
        return not self._stop.wait(RECONNECT_DELAY_S)

    # ------------------------------------------------------------ status
    def status(self) -> Dict:
        det = self.detector
        progress = round(min(1.0, self.frames / self.total_frames), 4) if self.total_frames else None
        return {
            "id": self.id,
            "cameraId": self.camera.get("id"),
            "cameraName": self.camera.get("name"),
            "source": self.source_label,
            "sourceType": self.source_type,
            "state": self.state,
            "active": self.is_active,
            "message": self.message,
            "error": self.error,
            "startedAt": self.started_at,
            "endedAt": self.ended_at,
            "framesProcessed": self.frames,
            "totalFrames": self.total_frames or None,
            "progress": progress,
            "inferences": det.inferences,
            "inferenceFps": self.inference_fps,
            "inferenceMs": self.inference_ms,
            "captureFps": self.capture_fps,
            "sourceFps": self.source_fps,
            "resolution": self.resolution,
            "reconnectAttempts": self.reconnect_attempts,
            "accidentInFrame": det.accident_in_last_inference,
            "lastAccidentConfidence": round(det.last_accident_conf, 3),
            "recordingAccidentId": det.active["id"] if det.active else None,
            "accidentIds": list(self.accident_ids),
            "lastAccident": self.last_accident,
            "streamUrl": f"/api/detect/sessions/{self.id}/stream",
            "latency": self.latency(),
        }

    def latency(self) -> Dict:
        def avg(d):
            vals = list(d)
            return round(sum(vals) / len(vals), 1) if vals else None
        return {
            "pipelineMs": avg(self._lat_pipeline),    # decode -> annotated frame ready
            "deliveryMs": avg(self._lat_delivery),    # decode -> sent to the browser
            "detectionMs": avg(self._lat_detection),  # decode -> YOLO11 result applied
            "inferenceMs": self.inference_ms,         # YOLO11 forward pass only
            "engine": f"{getattr(self.model, 'engine', '?')}/{getattr(self.model, 'device', '?')}",
        }


class SessionManager:
    def __init__(self, model_provider: Callable[[], ModelTrainer], store: AccidentStore = accident_store):
        self._model_provider = model_provider
        self._store = store
        self._sessions: Dict[str, DetectionSession] = {}
        self._lock = threading.Lock()

    def start(self, source: str, camera: Optional[Dict] = None, session_id: Optional[str] = None,
              source_type: Optional[str] = None, on_first_frame=None) -> DetectionSession:
        session_id = session_id or f"adhoc-{uuid.uuid4().hex[:8]}"
        with self._lock:
            old = self._sessions.get(session_id)
            if old is not None:
                old.stop("Restarted")
            session = DetectionSession(session_id, source, self._model_provider(), camera=camera,
                                       store=self._store, source_type=source_type,
                                       on_first_frame=on_first_frame)
            self._sessions[session_id] = session
        return session.start()

    def get(self, session_id: str) -> Optional[DetectionSession]:
        return self._sessions.get(session_id)

    def list(self) -> List[DetectionSession]:
        return list(self._sessions.values())

    def stop(self, session_id: str) -> Optional[DetectionSession]:
        s = self._sessions.get(session_id)
        if s:
            s.stop()
        return s

    def remove(self, session_id: str):
        s = self._sessions.pop(session_id, None)
        if s:
            s.stop()

    def stop_all(self):
        for s in self.list():
            s.stop("Server shutting down")
        for s in self.list():
            s.join(timeout=3)

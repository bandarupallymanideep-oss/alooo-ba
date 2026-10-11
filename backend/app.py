"""SADARAKSHAK - Real-Time Road Accident Detection and Monitoring System (FastAPI backend).

Two logically separate but connected paths:

  LIVE VIEW : RTSP / video -> backend session -> annotated MJPEG  (<img src=".../stream">)
  DETECTION : RTSP / video -> OpenCV -> YOLO11 (model/best.pt) -> accident -> detected_accidents/accidentN.mp4
              -> /api/accidents -> frontend Alerts

Browsers cannot play rtsp:// directly, and FFmpeg/MediaMTX are not required: the
backend decodes the stream with OpenCV and serves annotated frames as MJPEG.
"""
import asyncio
import base64
import json
import re
import time
import traceback
import uuid
import logging as _std_logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from sadarakshak.constant.application import (
    APP_NAME, APP_DESCRIPTION, BASE_DIR, MODEL_PATH, ACCIDENT_CLIPS_DIR, ACCIDENT_IMAGES_DIR,
    DETECTED_ACCIDENTS_DIR, UPLOADS_DIR, VIDEO_EXTENSIONS, CONFIDENCE_THRESHOLD, MJPEG_MAX_FPS,
)
from sadarakshak.components.accident_detector import ACCIDENT_CLASS_IDS
from sadarakshak.components.categories import categories_for_model
from sadarakshak.components.accident_store import accident_store
from sadarakshak.components.camera_store import camera_store
from sadarakshak.components.stream_utils import (
    SourceError, diagnose_source, is_stream_url, mask_url, resolve_file_source, open_capture,
)
from sadarakshak.pipeline.detection_session import SessionManager
from sadarakshak.pipeline.training_pipeline import TrainingPipeline
from sadarakshak.logger import logging

MAX_UPLOAD_BYTES = 500 * 1024 * 1024


# ------------------------------------------------------------------ log hygiene
class _MaskCredentialsFilter(_std_logging.Filter):
    """Never let rtsp://user:password@ reach the access log (legacy GET endpoints take URLs in the query)."""
    _re = re.compile(r"((?:rtsps?|https?|rtmp)(?:%3A|:)(?:%2F|/){2}[^:%/@&?]*(?:%3A|:))[^@&]*?(%40|@)", re.I)

    def filter(self, record):
        if isinstance(record.args, tuple):
            record.args = tuple(self._re.sub(r"\1***\2", a) if isinstance(a, str) else a for a in record.args)
        return True


_std_logging.getLogger("uvicorn.access").addFilter(_MaskCredentialsFilter())

# ------------------------------------------------------------------ model & managers
pipeline = TrainingPipeline()  # loads model/best.pt once (YOLO11m, 10 classes)
sessions = SessionManager(model_provider=lambda: pipeline.model_trainer)


def _save_thumbnail(camera_id: str):
    def cb(frame: np.ndarray):
        cv2.imwrite(str(camera_store.thumbnail_path(camera_id)), frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return cb


def _session_status(session_id: str):
    s = sessions.get(session_id)
    return s.status() if s else None


def _public_camera(cam):
    return camera_store.public(cam, _session_status(cam["id"]))


def _err(code: str, message: str, status: int = 400, **extra):
    return JSONResponse(status_code=status, content={"success": False, "code": code, "message": message,
                                                     "detail": message, **extra})


def _camera_source(cam) -> str:
    """Real (unmasked) source for a camera: an RTSP URL or a server-side file path."""
    src = (cam.get("sourceUrl") or "").strip()
    if is_stream_url(src):
        return src
    return str(resolve_file_source(src))


async def _start_camera(cam, test_first: bool = True):
    try:
        source = _camera_source(cam)
    except SourceError as e:
        return _err(e.code, e.message, e.status_code)
    if test_first and is_stream_url(source):
        result, frame = await run_in_threadpool(diagnose_source, source)
        camera_store.set_fields(cam["id"], lastTest={**result, "testedAt": datetime.utcnow().isoformat() + "Z"})
        if frame is not None:
            _save_thumbnail(cam["id"])(frame)
        if not result["success"]:
            return _err(result["code"], result["message"], 400, test=result,
                        camera=_public_camera(camera_store.get(cam["id"])))
    session = sessions.start(source, camera={k: cam.get(k) for k in ("id", "name", "location", "latitude", "longitude")},
                             session_id=cam["id"], source_type="rtsp" if is_stream_url(source) else "file",
                             on_first_frame=_save_thumbnail(cam["id"]))
    camera_store.set_fields(cam["id"], autoStart=is_stream_url(source))
    logging.info(f"Detection started for camera {cam['id']} ({mask_url(source) if is_stream_url(source) else Path(source).name})")
    return {"success": True, "session": session.status(), "camera": _public_camera(camera_store.get(cam["id"]))}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    accident_store.recover_interrupted()  # clips cut off by a previous crash/restart
    # resume monitoring of RTSP cameras that were running before a restart (files are not re-processed)
    for cam in camera_store.list():
        if cam.get("autoStart") and is_stream_url(cam.get("sourceUrl") or ""):
            logging.info(f"Resuming detection for camera {cam['id']}")
            sessions.start(cam["sourceUrl"], camera=cam, session_id=cam["id"], source_type="rtsp",
                           on_first_frame=_save_thumbnail(cam["id"]))
    yield
    sessions.stop_all()


app = FastAPI(title=f"{APP_NAME} API", description=APP_DESCRIPTION, lifespan=lifespan)

app.mount("/accident_images", StaticFiles(directory=str(ACCIDENT_IMAGES_DIR)), name="accident_images")
app.mount("/accident_clips", StaticFiles(directory=str(ACCIDENT_CLIPS_DIR)), name="accident_clips")
app.mount("/detected_accidents", StaticFiles(directory=str(DETECTED_ACCIDENTS_DIR)), name="detected_accidents")

# CORS: local Vite dev/preview servers on any port + configured production origins
allowed_origins = [o.strip() for o in __import__("os").environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"(https?://(localhost|127\.0\.0\.1)(:\d+)?)|(https://.*\.vercel\.app)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================================================================== health
@app.get("/health")
async def health_check():
    model = pipeline.model_trainer
    active = [s for s in sessions.list() if s.is_active]
    return {
        "status": "ok",
        "app": APP_NAME,
        "model": {
            "path": str(MODEL_PATH.relative_to(BASE_DIR)) if MODEL_PATH.is_relative_to(BASE_DIR) else MODEL_PATH.name,
            "type": "YOLO11m (Ultralytics detect)",
            "engine": model.engine,
            "device": str(model.device),
            "warmupInferenceMs": round(model.warmup_ms, 1),
            "classes": model.class_names,
            "accidentClassIds": sorted(ACCIDENT_CLASS_IDS),
            "confidenceThreshold": CONFIDENCE_THRESHOLD,
        },
        "activeSessions": len(active),
        "accidentsSaved": len(accident_store.list()),
        "detectedAccidentsDir": str(DETECTED_ACCIDENTS_DIR),
    }


@app.get("/images")
async def list_images():
    images = []
    for file in ACCIDENT_IMAGES_DIR.glob("*.jpg"):
        images.append({
            "filename": file.name,
            "url": f"/accident_images/{file.name}",
            "created": datetime.fromtimestamp(file.stat().st_ctime).isoformat(),
            "size_bytes": file.stat().st_size,
        })
    return {"images": images, "count": len(images)}


# ================================================================== RTSP connection test
class ConnectionTestRequest(BaseModel):
    rtsp_url: Optional[str] = None
    camera_id: Optional[str] = None


async def _run_connection_test(rtsp_url: Optional[str], camera_id: Optional[str]):
    source = rtsp_url
    if camera_id:
        cam = camera_store.get(camera_id)
        if not cam:
            return _err("CAMERA_NOT_FOUND", f"Camera '{camera_id}' not found.", 404)
        # the stored (real) URL is used unless the user typed a new one
        if not source or source == mask_url(cam.get("sourceUrl") or ""):
            source = cam.get("sourceUrl")
    if not source:
        return _err("INVALID_URL", "Please enter an RTSP URL, e.g. rtsp://192.168.1.100:554/stream")
    result, frame = await run_in_threadpool(diagnose_source, source)
    if camera_id:
        camera_store.set_fields(camera_id, lastTest={**result, "testedAt": datetime.utcnow().isoformat() + "Z"})
        if frame is not None:
            _save_thumbnail(camera_id)(frame)
    return JSONResponse(status_code=200, content=result)


@app.post("/api/cctv/test-connection")
async def test_cctv_connection_post(body: ConnectionTestRequest):
    """Test an RTSP URL (or a saved camera) step by step and explain any failure."""
    return await _run_connection_test(body.rtsp_url, body.camera_id)


@app.get("/api/cctv/test-connection")
async def test_cctv_connection(rtsp_url: str = "", camera_id: Optional[str] = None):
    """Legacy GET variant (prefer POST: credentials in a query string can end up in proxy logs)."""
    return await _run_connection_test(rtsp_url, camera_id)


def generate_mjpeg_stream(source: str):
    """Raw (non-annotated) MJPEG preview of an RTSP URL or local clip."""
    cap = open_capture(source)
    if not cap.isOpened():
        logging.error(f"Cannot open video source for streaming: {mask_url(source)}")
        return
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                if not is_stream_url(source):  # loop local files
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                if not ret:
                    break
            h, w = frame.shape[:2]
            if w > 1280:
                frame = cv2.resize(frame, (1280, int(h * 1280 / w)))
            ok, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if ok:
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n'
            time.sleep(0.04)
    except Exception as e:
        logging.error(f"Error in MJPEG stream: {e}")
    finally:
        cap.release()


@app.get("/api/cctv/stream")
async def stream_cctv(rtsp_url: str = "", camera_id: Optional[str] = None):
    """Raw MJPEG preview: <img src="/api/cctv/stream?camera_id=cam-1" />."""
    source = rtsp_url
    if camera_id:
        cam = camera_store.get(camera_id)
        if not cam:
            return _err("CAMERA_NOT_FOUND", f"Camera '{camera_id}' not found.", 404)
        source = cam.get("sourceUrl")
    if not source:
        return _err("INVALID_URL", "rtsp_url or camera_id is required")
    if not is_stream_url(source):
        try:
            source = str(resolve_file_source(source))
        except SourceError as e:
            return _err(e.code, e.message, e.status_code)
    return StreamingResponse(generate_mjpeg_stream(source), media_type="multipart/x-mixed-replace; boundary=frame")


# ================================================================== cameras
class CameraBody(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    sourceType: Optional[str] = None
    sourceUrl: Optional[str] = None
    fileName: Optional[str] = None
    startDetection: Optional[bool] = None


def _validate_camera_source(source_type: Optional[str], source_url: Optional[str]):
    if not source_url:
        raise SourceError("INVALID_URL", "A camera needs an RTSP URL or a video file.")
    if source_type == "rtsp" or "://" in source_url:
        from sadarakshak.components.stream_utils import validate_stream_url
        validate_stream_url(source_url)
    else:
        resolve_file_source(source_url)


@app.get("/api/cameras")
async def list_cameras():
    return {"cameras": [_public_camera(c) for c in camera_store.list()]}


@app.post("/api/cameras")
async def create_camera(body: CameraBody):
    data = body.model_dump(exclude_none=True)
    if not (data.get("name") or "").strip():
        return _err("INVALID_NAME", "Camera name is required.")
    try:
        _validate_camera_source(data.get("sourceType"), data.get("sourceUrl"))
    except SourceError as e:
        return _err(e.code, e.message, e.status_code)
    data["sourceType"] = "rtsp" if is_stream_url(data["sourceUrl"]) else "upload"
    cam = camera_store.create(data)
    logging.info(f"Camera created {cam['id']} ({mask_url(cam['sourceUrl'])})")
    if body.startDetection:
        res = await _start_camera(cam)
        if isinstance(res, JSONResponse):  # saved, but detection could not start: report both
            payload = json.loads(res.body)
            payload["camera"] = _public_camera(camera_store.get(cam["id"]))
            payload["saved"] = True
            return JSONResponse(status_code=200, content=payload)
        return {"success": True, "camera": res["camera"], "session": res["session"]}
    return {"success": True, "camera": _public_camera(cam)}


@app.put("/api/cameras/{camera_id}")
async def update_camera(camera_id: str, body: CameraBody):
    cam = camera_store.get(camera_id)
    if not cam:
        return _err("CAMERA_NOT_FOUND", f"Camera '{camera_id}' not found.", 404)
    data = body.model_dump(exclude_none=True)
    new_src = data.get("sourceUrl")
    if new_src and new_src != mask_url(cam.get("sourceUrl") or ""):
        try:
            _validate_camera_source(data.get("sourceType"), new_src)
        except SourceError as e:
            return _err(e.code, e.message, e.status_code)
        data["sourceType"] = "rtsp" if is_stream_url(new_src) else "upload"
    source_changed = bool(new_src and new_src != mask_url(cam.get("sourceUrl") or ""))
    cam = camera_store.update(camera_id, data)
    if source_changed:
        camera_store.set_fields(camera_id, lastTest=None)
        sessions.remove(camera_id)
    if body.startDetection is True and not (sessions.get(camera_id) and sessions.get(camera_id).is_active):
        res = await _start_camera(camera_store.get(camera_id))
        if isinstance(res, JSONResponse):
            payload = json.loads(res.body)
            payload["camera"] = _public_camera(camera_store.get(camera_id))
            payload["saved"] = True
            return JSONResponse(status_code=200, content=payload)
    elif body.startDetection is False:
        sessions.stop(camera_id)
        camera_store.set_fields(camera_id, autoStart=False)
    return {"success": True, "camera": _public_camera(camera_store.get(camera_id))}


@app.delete("/api/cameras/{camera_id}")
async def delete_camera(camera_id: str):
    sessions.remove(camera_id)
    if not camera_store.delete(camera_id):
        return _err("CAMERA_NOT_FOUND", f"Camera '{camera_id}' not found.", 404)
    return {"success": True}


@app.post("/api/cameras/{camera_id}/test")
async def test_camera(camera_id: str):
    return await _run_connection_test(None, camera_id)


@app.post("/api/cameras/{camera_id}/start")
async def start_camera(camera_id: str):
    cam = camera_store.get(camera_id)
    if not cam:
        return _err("CAMERA_NOT_FOUND", f"Camera '{camera_id}' not found.", 404)
    return await _start_camera(cam)


@app.post("/api/cameras/{camera_id}/stop")
async def stop_camera(camera_id: str):
    if not camera_store.get(camera_id):
        return _err("CAMERA_NOT_FOUND", f"Camera '{camera_id}' not found.", 404)
    sessions.stop(camera_id)
    camera_store.set_fields(camera_id, autoStart=False)
    return {"success": True, "camera": _public_camera(camera_store.get(camera_id))}


@app.get("/api/cameras/{camera_id}/thumbnail")
async def camera_thumbnail(camera_id: str):
    path = camera_store.thumbnail_path(camera_id)
    if not re.fullmatch(r"[\w-]+", camera_id) or not path.exists():
        raise HTTPException(status_code=404, detail="No thumbnail yet")
    return FileResponse(path, media_type="image/jpeg")


# ================================================================== uploads
async def _save_upload(file: UploadFile) -> Path:
    name = Path(file.filename or "video.mp4").name
    ext = Path(name).suffix.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise SourceError("UNSUPPORTED_FILE", f"Unsupported file type '{ext or '?'}'. Allowed: {', '.join(sorted(VIDEO_EXTENSIONS))}")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name).stem)[:60] or "video"
    dest = UPLOADS_DIR / f"upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}_{safe}{ext}"
    size = 0
    with open(dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                f.close()
                dest.unlink(missing_ok=True)
                raise SourceError("FILE_TOO_LARGE", "Video is larger than the 500 MB limit.", 413)
            f.write(chunk)
    if size == 0:
        dest.unlink(missing_ok=True)
        raise SourceError("EMPTY_FILE", "The uploaded file is empty.")
    result, _ = await run_in_threadpool(diagnose_source, str(dest), True)
    if not result["success"]:
        dest.unlink(missing_ok=True)
        raise SourceError(result["code"], result["message"])
    return dest


@app.post("/api/uploads")
async def upload_video(file: UploadFile = File(...)):
    """Store a user video in backend/uploads and return its server path (used as a camera source)."""
    try:
        dest = await _save_upload(file)
    except SourceError as e:
        return _err(e.code, e.message, e.status_code)
    return {"success": True, "filename": dest.name, "originalName": file.filename,
            "url": f"/uploads/{dest.name}", "sizeBytes": dest.stat().st_size}


# ================================================================== detection sessions
class RtspDetectRequest(BaseModel):
    rtsp_url: Optional[str] = None
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    location: Optional[str] = None


@app.post("/api/detect/rtsp")
async def detect_rtsp(body: RtspDetectRequest):
    """Start live detection on a saved camera (camera_id) or an ad-hoc RTSP URL."""
    if body.camera_id:
        cam = camera_store.get(body.camera_id)
        if not cam:
            return _err("CAMERA_NOT_FOUND", f"Camera '{body.camera_id}' not found.", 404)
        return await _start_camera(cam)
    result, _ = await run_in_threadpool(diagnose_source, body.rtsp_url or "")
    if not result["success"]:
        return _err(result["code"], result["message"], 400, test=result)
    if not is_stream_url(body.rtsp_url):
        return _err("INVALID_URL", "Use /api/detect/video or /api/detect/sample-clip for video files.")
    sid = f"rtsp-{uuid.uuid4().hex[:8]}"
    session = sessions.start(body.rtsp_url, session_id=sid, source_type="rtsp", camera={
        "id": sid, "name": body.camera_name or f"RTSP {mask_url(body.rtsp_url)}", "location": body.location or "Unknown location"})
    return {"success": True, "test": result, "session": session.status()}


@app.post("/api/detect/video")
async def detect_video_upload(file: UploadFile = File(...), camera_name: str = Form(""), location: str = Form("")):
    """Upload a video and start background detection on it (watch it via the session stream)."""
    try:
        dest = await _save_upload(file)
    except SourceError as e:
        return _err(e.code, e.message, e.status_code)
    sid = f"video-{uuid.uuid4().hex[:8]}"
    session = sessions.start(str(dest), session_id=sid, source_type="file", camera={
        "id": sid, "name": camera_name or f"Upload: {file.filename}", "location": location or "Uploaded video"})
    return {"success": True, "upload": {"filename": dest.name, "url": f"/uploads/{dest.name}"}, "session": session.status()}


@app.get("/api/detect/sessions")
async def list_sessions():
    return {"sessions": [s.status() for s in sessions.list()]}


@app.get("/api/detect/sessions/{session_id}")
async def get_session(session_id: str):
    st = _session_status(session_id)
    if st is None:
        return _err("SESSION_NOT_FOUND", f"No detection session '{session_id}'.", 404)
    return st


@app.post("/api/detect/sessions/{session_id}/stop")
async def stop_session(session_id: str):
    s = sessions.stop(session_id)
    if s is None:
        return _err("SESSION_NOT_FOUND", f"No detection session '{session_id}'.", 404)
    if camera_store.get(session_id):
        camera_store.set_fields(session_id, autoStart=False)
    return {"success": True, "session": s.status()}


@app.get("/api/detect/sessions/{session_id}/stream")
async def session_stream(session_id: str, request: Request, overlay: bool = True):
    """Live annotated MJPEG of a detection session (overlay=false -> raw frames)."""
    if sessions.get(session_id) is None:
        return _err("SESSION_NOT_FOUND", f"No detection session '{session_id}'.", 404)

    async def gen():
        # Push each new frame as soon as it is ready (checked every 5 ms) instead of a fixed
        # poll interval, capped at MJPEG_MAX_FPS - keeps display latency low.
        last_seq, last_sent, min_gap = -1, 0.0, 1.0 / MJPEG_MAX_FPS
        checks = 0
        while True:
            checks += 1
            if checks % 40 == 0 and await request.is_disconnected():
                break
            s = sessions.get(session_id)
            if s is None:
                break
            if s.frame_seq != last_seq and time.time() - last_sent >= min_gap:
                jpeg, seq, captured_at = (s.get_jpeg(True) if overlay
                                          else await run_in_threadpool(s.get_jpeg, False))
                if jpeg:
                    last_seq, last_sent = seq, time.time()
                    yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                    s.note_delivery(captured_at)
                    continue
            elif not s.is_active and s.frame_seq == last_seq:
                break  # session over: the browser keeps showing the last frame
            await asyncio.sleep(0.005)

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame",
                             headers={"Cache-Control": "no-store"})


@app.get("/api/detect/sessions/{session_id}/snapshot")
async def session_snapshot(session_id: str, overlay: bool = True):
    s = sessions.get(session_id)
    jpeg = s.get_jpeg(overlay)[0] if s else None
    if not jpeg:
        raise HTTPException(status_code=404, detail="No frame available")
    return Response(content=jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


# ================================================================== accidents (generated files)
class AccidentUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    operatorName: Optional[str] = None


@app.get("/api/accidents")
async def list_accidents(camera_id: Optional[str] = None):
    records = accident_store.list()
    if camera_id:
        records = [r for r in records if r.get("cameraId") == camera_id]
    return {"accidents": records, "count": len(records)}


@app.get("/api/accidents/{accident_id}")
async def get_accident(accident_id: str):
    rec = accident_store.get(accident_id)
    if rec is None:
        return _err("ACCIDENT_NOT_FOUND", f"Accident '{accident_id}' not found.", 404)
    return rec


@app.get("/api/accident-categories")
async def accident_categories():
    """Alert categories and whether the current YOLO model can detect them."""
    return {"categories": categories_for_model(pipeline.model_trainer.class_names.values())}


@app.delete("/api/accidents/{accident_id}")
async def delete_accident(accident_id: str):
    """Delete an accident alert (its video/snapshot/metadata are moved to detected_accidents/deleted/)."""
    try:
        ok = accident_store.delete(accident_id)
    except RuntimeError as e:
        return _err("ACCIDENT_RECORDING", str(e), 409)
    if not ok:
        return _err("ACCIDENT_NOT_FOUND", f"Accident '{accident_id}' not found.", 404)
    return {"success": True, "id": accident_id}


@app.patch("/api/accidents/{accident_id}")
async def update_accident(accident_id: str, body: AccidentUpdate):
    try:
        rec = accident_store.update(accident_id, status=body.status, notes=body.notes, operator=body.operatorName)
    except ValueError as e:
        return _err("INVALID_STATUS", str(e))
    if rec is None:
        return _err("ACCIDENT_NOT_FOUND", f"Accident '{accident_id}' not found.", 404)
    return rec


# ================================================================== sample clips (backend/accident_clips)
@app.get("/api/accident-clips")
async def list_accident_clips():
    """List the original test videos in backend/accident_clips (never modified)."""
    clips = []
    for file in sorted(ACCIDENT_CLIPS_DIR.iterdir()):
        if file.suffix.lower() in VIDEO_EXTENSIONS:
            clips.append({
                "filename": file.name,
                "size_bytes": file.stat().st_size,
                "size_mb": round(file.stat().st_size / (1024 * 1024), 2),
                "url": f"/accident_clips/{file.name}",
            })
    return {"clips": clips, "count": len(clips)}


@app.post("/api/detect/sample-clip")
async def detect_sample_clip(filename: str = Form(...), background: bool = Form(False),
                             detect_every: int = Form(2)):
    """Run detection on a clip from backend/accident_clips.

    background=false (default, original behaviour): process the whole clip and return the result.
    background=true: start a live session and return immediately (watch via its stream URL).
    """
    try:
        clip_path = resolve_file_source(f"/accident_clips/{Path(filename).name}")
    except SourceError as e:
        return _err(e.code, e.message, e.status_code)
    camera = {"id": f"clip-{clip_path.stem}", "name": f"Sample Clip - {clip_path.name}", "location": "Test footage"}
    if background:
        session = sessions.start(str(clip_path), camera=camera, session_id=camera["id"], source_type="file")
        return {"success": True, "session": session.status()}
    res = await run_in_threadpool(pipeline.process_video, str(clip_path), None, False, camera, detect_every)
    return JSONResponse(content={
        "status": "success", "result": res["result"], "accident_detected": res["accident_detected"],
        "filename": clip_path.name, "output_video": res["output_video"],
        "accidents": res["accidents"], "details": {k: v for k, v in res.items() if k != "accidents"},
        "message": f"Analysis complete: {res['result']} ({len(res['accidents'])} accident clip(s) saved)",
    })


# ================================================================== legacy endpoints
@app.post("/detect/image")
async def detect_image(file: UploadFile = File(...)):
    contents = await file.read()
    img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return _err("INVALID_IMAGE", "Could not decode the uploaded image.")
    result = await run_in_threadpool(pipeline.process_frame, img)
    return JSONResponse(content={"status": "success", "result": result,
                                 "accident_detected": result == "Accident detected"})


@app.post("/detect/video")
async def detect_video(file: UploadFile = File(...), detect_every: int = Form(2)):
    """Legacy synchronous analysis of an uploaded video (use /api/detect/video for live progress)."""
    try:
        dest = await _save_upload(file)
    except SourceError as e:
        return _err(e.code, e.message, e.status_code)
    camera = {"id": "upload", "name": f"Upload: {file.filename}", "location": "Uploaded video"}
    res = await run_in_threadpool(pipeline.process_video, str(dest), None, False, camera, detect_every)
    return JSONResponse(content={
        "status": "success", "result": res["result"], "accident_detected": res["accident_detected"],
        "filename": file.filename, "output_video": res["output_video"], "accidents": res["accidents"],
        "details": {k: v for k, v in res.items() if k != "accidents"},
        "message": f"Video analysis complete: {res['result']}",
    })


@app.websocket("/ws/detect")
async def accident_detection_websocket(websocket: WebSocket):
    """Legacy WebSocket API, now backed by the shared detection session engine."""
    await websocket.accept()
    connection_id = f"ws-{uuid.uuid4().hex[:8]}"
    await websocket.send_json({"message": "Connected to accident detection service", "severity": "info"})
    await websocket.send_json({"type": "ready", "message": "Backend ready for video processing", "severity": "info"})
    try:
        while True:
            data = json.loads(await websocket.receive_text())
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if data.get("type") != "process_video" or not data.get("video_url"):
                continue
            source = data["video_url"]
            if not is_stream_url(source):
                try:
                    source = str(resolve_file_source(source))
                except SourceError as e:
                    await websocket.send_json({"type": "error", "message": e.message, "severity": "error"})
                    continue
            camera = {"id": data.get("camera_id") or connection_id, "name": data.get("camera_name", "Unknown Camera"),
                      "latitude": data.get("latitude"), "longitude": data.get("longitude")}
            s = sessions.start(source, camera=camera, session_id=connection_id)
            last_seq, sent_info, sent_ids = -1, False, set()
            while True:
                st = s.status()
                if not sent_info and st["resolution"]:
                    w, h = map(int, st["resolution"].split("x"))
                    sent_info = True
                    await websocket.send_json({"type": "video_info", "width": w, "height": h, "fps": st["sourceFps"],
                                               "total_frames": st["totalFrames"], "severity": "info",
                                               "message": f"Processing video ({st['resolution']})"})
                jpeg, seq, _ = s.get_jpeg(True)
                if jpeg and seq != last_seq:
                    last_seq = seq
                    await websocket.send_json({"type": "frame", "frame": base64.b64encode(jpeg).decode(),
                                               "frame_number": st["framesProcessed"], "progress": st["progress"] or 0,
                                               "timestamp": time.time()})
                for aid in st["accidentIds"]:
                    if aid not in sent_ids:
                        sent_ids.add(aid)
                        rec = accident_store.get(aid) or {}
                        await websocket.send_json({"type": "accident", "accident_detected": True, "accident_id": aid,
                                                   "accident_type": rec.get("accidentType"),
                                                   "confidence": rec.get("confidence"), "severity": "error",
                                                   "message": f"{rec.get('accidentType')} detected ({aid})",
                                                   "timestamp": time.time()})
                        await websocket.send_json({"type": "image_saved", "image_url": rec.get("snapshotUrl"),
                                                   "video_url": rec.get("videoClipUrl"), "severity": "info",
                                                   "message": f"Accident footage saved: {rec.get('clipFile')}"})
                if not s.is_active:
                    if st["state"] == "error":
                        await websocket.send_json({"type": "error", "severity": "error",
                                                   "message": (st["error"] or {}).get("message", "Processing failed")})
                    await websocket.send_json({"type": "processing_complete", "message": "Video processing completed",
                                               "severity": "info", "accident_found": bool(st["accidentIds"]),
                                               "accidents": st["accidentIds"], "total_frames": st["framesProcessed"],
                                               "timestamp": time.time()})
                    break
                await asyncio.sleep(1.0 / MJPEG_MAX_FPS)
    except WebSocketDisconnect:
        logging.info(f"Client disconnected: {connection_id}")
    except Exception as e:
        logging.error(f"Error in WebSocket: {e}\n{traceback.format_exc()}")
    finally:
        sessions.remove(connection_id)

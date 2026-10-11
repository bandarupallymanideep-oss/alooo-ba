"""
SADARAKSHAK application configuration.

Every value can be overridden with an environment variable of the same name
prefixed with ``SADARAKSHAK_`` (e.g. ``SADARAKSHAK_CONFIDENCE_THRESHOLD=0.8``).
"""
import os
from pathlib import Path


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(f"SADARAKSHAK_{name}", default))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(f"SADARAKSHAK_{name}", default))
    except ValueError:
        return default


APP_NAME = "SADARAKSHAK"
APP_DESCRIPTION = "Real-Time Road Accident Detection and Monitoring System"

# ---------------------------------------------------------------- paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/
MODEL_PATH = Path(os.environ.get("SADARAKSHAK_MODEL_PATH", BASE_DIR / "model" / "best.pt"))
ACCIDENT_CLIPS_DIR = BASE_DIR / "accident_clips"          # original test videos (read-only)
DETECTED_ACCIDENTS_DIR = BASE_DIR / "detected_accidents"  # generated accidentN.mp4 / .jpg / .json
ACCIDENT_IMAGES_DIR = BASE_DIR / "accident_images"        # legacy snapshot folder
UPLOADS_DIR = BASE_DIR / "uploads"                        # user-uploaded videos
DATA_DIR = BASE_DIR / "data"                              # camera registry + thumbnails

for _d in (ACCIDENT_CLIPS_DIR, DETECTED_ACCIDENTS_DIR, ACCIDENT_IMAGES_DIR, UPLOADS_DIR, DATA_DIR):
    _d.mkdir(parents=True, exist_ok=True)

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"}

# ---------------------------------------------------------------- model / detection
# The trained model (YOLO11m) was trained at 640px; inference uses the same size.
INFERENCE_IMGSZ = _env_int("INFERENCE_IMGSZ", 640)
# auto | cpu | cuda | intel:gpu | intel:npu | intel:cpu  (intel:* = OpenVINO export of the same best.pt)
INFERENCE_DEVICE = os.environ.get("SADARAKSHAK_INFERENCE_DEVICE", "auto")
# Minimum confidence to draw a box on the annotated output.
DISPLAY_CONFIDENCE = _env_float("DISPLAY_CONFIDENCE", 0.25)
# Minimum confidence for an accident-class detection to count as an accident (existing value).
CONFIDENCE_THRESHOLD = _env_float("CONFIDENCE_THRESHOLD", 0.85)
# An accident event starts when, within the last CONFIRM_WINDOW_S seconds of video, at least
# MIN_ACCIDENT_HITS inferences are accidents AND they make up >= MIN_HIT_RATIO of the inferences.
# Time-based, so behaviour is the same whether YOLO runs at 3/s (CPU) or 30/s (iGPU).
MIN_ACCIDENT_HITS = _env_int("MIN_ACCIDENT_HITS", 2)
CONFIRM_WINDOW_S = _env_float("CONFIRM_WINDOW_S", 1.5)
MIN_HIT_RATIO = _env_float("MIN_HIT_RATIO", 0.4)
# Only count an accident when the same frame also contains a road object (car / bike / person).
# The model was trained on road footage only and can hallucinate "accidents" on unrelated content
# (e.g. a phone home screen); on backend/accident_clips every real accident frame has road context.
REQUIRE_ROAD_CONTEXT = _env_int("REQUIRE_ROAD_CONTEXT", 1) == 1
HIT_WINDOW = _env_int("HIT_WINDOW", 5)  # legacy (unused)

# ---------------------------------------------------------------- accident clip recording
PRE_ACCIDENT_SECONDS = _env_float("PRE_ACCIDENT_SECONDS", 3.0)    # footage kept before the accident
POST_ACCIDENT_SECONDS = _env_float("POST_ACCIDENT_SECONDS", 3.0)  # keep recording after last detection
MAX_CLIP_SECONDS = _env_float("MAX_CLIP_SECONDS", 30.0)
COOLDOWN_SECONDS = _env_float("COOLDOWN_SECONDS", 5.0)            # gap before a new event may start
MAX_FRAME_WIDTH = _env_int("MAX_FRAME_WIDTH", 1280)               # frames are downscaled above this

# ---------------------------------------------------------------- streams
STREAM_OPEN_TIMEOUT_MS = _env_int("STREAM_OPEN_TIMEOUT_MS", 15000)
STREAM_READ_TIMEOUT_MS = _env_int("STREAM_READ_TIMEOUT_MS", 8000)
TCP_CONNECT_TIMEOUT_S = _env_float("TCP_CONNECT_TIMEOUT_S", 4.0)
# Phones / Wi-Fi cameras (e.g. ScreenStream) can take several seconds to answer RTSP requests.
RTSP_HANDSHAKE_TIMEOUT_S = _env_float("RTSP_HANDSHAKE_TIMEOUT_S", 10.0)
RECONNECT_ATTEMPTS = _env_int("RECONNECT_ATTEMPTS", 5)
RECONNECT_DELAY_S = _env_float("RECONNECT_DELAY_S", 3.0)
# FFmpeg decodes H.264 with frame-threading = one frame of delay PER THREAD (14 threads on a
# 14-core CPU = ~470 ms). 1 decoder thread measured 36 ms RTSP latency and handles 1080p30.
STREAM_DECODER_THREADS = _env_int("STREAM_DECODER_THREADS", 1)
MJPEG_MAX_FPS = _env_float("MJPEG_MAX_FPS", 30.0)
MJPEG_QUALITY = _env_int("MJPEG_QUALITY", 80)

# RTSP over TCP is far more reliable than UDP through NAT/firewalls. nobuffer + low_delay stop FFmpeg
# from queueing frames (lower live latency). Respect a user override.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay")

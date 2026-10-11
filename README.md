# SADARAKSHAK — Real-Time Road Accident Detection and Monitoring System

SADARAKSHAK accepts a CCTV/IP-camera **RTSP stream** or an **uploaded accident video**, runs the trained
**YOLO11** accident model (`backend/model/best.pt`) on the backend, detects accidents automatically,
**saves the accident footage** (`backend/detected_accidents/accidentN.mp4`) and shows the live detection
and the saved footage in the React dashboard.

```
IP Camera / CCTV ──► RTSP stream ─┐
                                  ├─► FastAPI backend ─► OpenCV frames ─► YOLO11 ─► accident?
Uploaded / sample video ──────────┘         │                                        │
                                            │ annotated MJPEG (live view)            ▼
                                            ▼                          detected_accidents/accidentN.mp4 (+ .jpg, .json)
                                   React dashboard  ◄──── /api/accidents ◄───────────┘
                                   (Live Monitor, Alerts & Violations)
```

* **Live view path:** RTSP / video → backend session → annotated **MJPEG** → `<img>` in the browser.
  Browsers cannot play `rtsp://`, and no FFmpeg / MediaMTX installation is required.
* **Detection path:** RTSP / video → OpenCV → YOLO11 → accident confirmed → H.264 clip saved → Alerts.
  YOLO always runs on the server, never in the browser.

## Model

| | |
|---|---|
| File | `backend/model/best.pt` (reused as-is) |
| Architecture | YOLO11m (`yolo11m.yaml`), Ultralytics `detect`, trained at 640 px |
| Classes | 0 bike, 1 bike_bike_accident, 2 bike_object_accident, 3 bike_person_accident, 4 car, 5 car_bike_accident, 6 car_car_accident, 7 car_object_accident, 8 car_person_accident, 9 person |
| Accident classes | 1, 2, 3, 5, 6, 7, 8 |
| Trigger | accident class with confidence ≥ **0.85**, with a car/bike/person in view, in ≥ 2 inferences and ≥ 40 % of inferences within 1.5 s (time-based, independent of inference speed) |
| Clip | 3 s before the accident → until 3 s after the last detection (max 30 s), boxes drawn |

All values can be overridden with environment variables (see `backend/sadarakshak/constant/application.py`,
e.g. `SADARAKSHAK_CONFIDENCE_THRESHOLD=0.8`).

## Run

**Backend** (Windows):
```bat
cd /d C:\Users\banda\OneDrive\Desktop\SADARAKSHAK\backend
venv\Scripts\activate
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```
Health check: <http://localhost:8000/health> · API docs: <http://localhost:8000/docs>

**Frontend**:
```bat
cd /d C:\Users\banda\OneDrive\Desktop\SADARAKSHAK\frontend
npm install
npm run dev
```
Open the URL Vite prints (normally <http://localhost:5173>). The backend URL is configured in
`frontend/.env`: `VITE_BACKEND_URL=http://localhost:8000`.

## Test

```bat
cd backend
venv\Scripts\activate
python run_backend_test.py                                   :: model + accident.mp4 + invalid RTSP + API
python run_backend_test.py --max-frames 900                   :: quicker
python run_backend_test.py --rtsp rtsp://192.168.1.100:554/stream --rtsp-seconds 30
python run_backend_test.py --upload C:\path\to\video.mp4        :: needs the backend running
```

No camera? Start the built-in RTSP test camera (streams `accident_clips/accident.mp4`, needs nothing extra):
```bat
python tools\rtsp_test_server.py                                   :: rtsp://127.0.0.1:8554/stream
python tools\rtsp_test_server.py --port 8555 --user admin --password test123
```

## Main API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | status, model, classes, threshold |
| POST | `/api/cctv/test-connection` | `{rtsp_url}` or `{camera_id}` → step-by-step RTSP diagnosis |
| GET | `/api/cctv/stream` | raw MJPEG preview (legacy) |
| GET/POST/PUT/DELETE | `/api/cameras[/{id}]` | camera registry (RTSP passwords never returned) |
| POST | `/api/cameras/{id}/start` · `/stop` · `/test` | control detection for a camera |
| POST | `/api/detect/rtsp` | start live detection on a camera or ad-hoc RTSP URL |
| POST | `/api/detect/video` | upload a video and start detection |
| POST | `/api/uploads` | upload a video (camera source) |
| GET | `/api/detect/sessions[/{id}]` | live state: connecting / connected / detecting / accident / reconnecting / disconnected / error / completed |
| GET | `/api/detect/sessions/{id}/stream` | annotated live MJPEG |
| GET/PATCH/DELETE | `/api/accidents[/{id}]` | saved accidents; acknowledge / resolve / notes; delete (files moved to `detected_accidents/deleted/`) |
| GET | `/api/accident-categories` | alert categories and whether the current model supports them |
| GET | `/detected_accidents/accidentN.mp4` | the saved footage (H.264, range requests) |
| GET | `/api/accident-clips` · POST `/api/detect/sample-clip` | test videos in `backend/accident_clips` |

RTSP error codes: `INVALID_URL`, `DNS_FAILED`, `CONNECTION_REFUSED`, `TIMEOUT`, `UNREACHABLE`, `NOT_RTSP`,
`AUTH_REQUIRED`, `AUTH_FAILED`, `STREAM_NOT_FOUND`, `FORBIDDEN`, `UNSUPPORTED_STREAM`, `OPEN_FAILED`,
`NO_FRAMES`, `STREAM_DISCONNECTED`. Passwords are masked (`rtsp://user:***@host`) in all responses and logs.

## Performance & latency

* **Inference engine** (`SADARAKSHAK_INFERENCE_DEVICE`, default `auto`): CUDA GPU if present, otherwise
  **OpenVINO** on the Intel iGPU / NPU (an automatic export of the *same* `best.pt` weights to
  `model/best_openvino_model/`), otherwise PyTorch CPU. On the Core Ultra 5 225H: PyTorch CPU ≈ 107–240 ms,
  OpenVINO Arc iGPU ≈ 15 ms per frame, with 99.4 % identical accident decisions.
* **RTSP decoding** uses 1 FFmpeg decoder thread (`SADARAKSHAK_STREAM_DECODER_THREADS`): frame-threading added
  one frame of delay per thread (≈ 470 ms on 14 cores); 1 thread measured 36 ms.
* Measured end-to-end (test camera → backend YOLO11 → HTTP client): **median ≈ 54 ms, p90 ≈ 68 ms**.
  Measure it yourself:
  ```bat
  python tools\rtsp_test_server.py --stamp
  :: start detection on rtsp://127.0.0.1:8554/stream (e.g. camera cam-3), then:
  python tools\measure_latency.py --session cam-3
  ```
* Live tiles show the measured latency (frame decoded → sent to the browser) and YOLO detection latency.

## UI

* Dark and light themes (switch in the top bar, remembered per browser).
* Accident videos are reviewed at **0.25x** by default (0.5x / 1x / 1.5x / 2x available).
* Alerts & Violations: category filter (CAR–CAR, CAR–TRUCK, CAR–PERSON, TRUCK–PERSON + other model classes;
  truck categories are marked N/A because the current model has no truck class), View / Delete with confirmation.
* Cameras: Start, Alerts & Violations, Delete Camera (with confirmation) and a ⋮ action menu.

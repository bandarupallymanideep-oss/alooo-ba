# SADARAKSHAK – AI-Based Real-Time Road Accident Detection System

SADARAKSHAK (**सदारक्षक**) is an intelligent, real-time road accident detection and monitoring system designed to bridge the gap between traffic surveillance and emergency response.

The system ingests live **RTSP CCTV video streams** or **uploaded traffic footage**, analyzes video frames with a custom-trained **YOLO11** computer vision model on the server, confirms accident events using robust multi-frame temporal criteria, records pre- and post-accident video clips, and delivers instant alerts and annotated live monitoring to authorities via a modern web dashboard.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │            VIDEO INGESTION             │
                      │  IP CCTV (RTSP) / Uploaded MP4 Videos  │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │            FASTAPI BACKEND             │
                      │       OpenCV Video Frame Capture       │
                      │  Thread 1: Capture & MJPEG Live View   │
                      │  Thread 2: YOLO11 Accident Inference   │
                      └───────────────┬────────┬───────────────┘
                                      │        │
                   Live MJPEG Stream  │        │ Accident Confirmed Event
                                      │        ▼
                                      │  ┌───────────────────────────────┐
                                      │  │ Pre/Post H.264 Clip Recording │
                                      │  │ (detected_accidents/*.mp4)    │
                                      │  └─────────────┬─────────────────┘
                                      │                │
                                      ▼                ▼
                      ┌────────────────────────────────────────┐
                      │          FRONTEND DASHBOARD            │
                      │    React 19 + TypeScript + Vite UI     │
                      │   (Hosted on Vercel Edge Network)      │
                      │  - Live Camera Monitoring Grid         │
                      │  - Instant Accident Alerts & Videos    │
                      │  - Interactive Map & Camera Controls   │
                      └────────────────────────────────────────┘
```

### Two-Stream Architecture
1. **Live View Path:** RTSP / file video $\rightarrow$ Backend Session $\rightarrow$ Real-time annotated **MJPEG** stream $\rightarrow$ Browser `<img>` tag. Standard web browsers cannot play raw `rtsp://` streams natively; SADARAKSHAK decodes frames server-side via OpenCV and serves annotated frames without requiring external transcoding servers (e.g., FFmpeg / MediaMTX).
2. **Detection & Recording Path:** Frames $\rightarrow$ YOLO11 $\rightarrow$ Accident confirmed $\rightarrow$ Automatic clip recording (**3 seconds pre-event** to **3 seconds post-event**, up to 30s) $\rightarrow$ `/api/accidents` $\rightarrow$ Real-time frontend alerts with downloadable H.264 video clips and high-resolution snapshots.

---

## Key Features

- **ONVIF Camera Auto-Discovery:** Automated IP camera detection on reachable networks via WS-Discovery (UDP multicast 239.255.255.250:3702), SOAP device inspection, media profile enumeration, and one-click RTSP stream resolution.
- **Three Video Input Sources:** Full support for (1) ONVIF CCTV auto-discovery, (2) manual RTSP stream URLs, and (3) recorded video file uploads.
- **Live RTSP CCTV Ingestion:** Connects directly to IP cameras over RTSP (TCP interleaved transport with reconnect recovery and credentials masking).
- **Video File Uploads:** Supports test video uploads and built-in sample clips for offline analysis and benchmarking.
- **Real-Time YOLO11 Detection:** Custom-trained YOLO11m model detecting 10 road object & accident classes with bounding box annotations.
- **Accident Verification Engine:** Prevents false alarms by enforcing temporal criteria (minimum hit ratio, minimum consecutive inferences within a time window, and road context checks).
- **Automated Evidence Recording:** Automatically cuts and saves H.264 video clips and snapshots of every confirmed accident with bounding boxes.
- **Web Dashboard:** Full-featured React 19 interface with dark/light themes, slow-motion review playback (0.25x – 2x), interactive camera maps, and incident management (acknowledge/resolve/delete).
- **Hardware Acceleration:** Automatic hardware fallback (`CUDA GPU` $\rightarrow$ `OpenVINO Intel iGPU/NPU` $\rightarrow$ `PyTorch CPU`).

---

## Technology Stack

- **AI Model & Computer Vision:** Ultralytics YOLO11 (`yolo11m`), OpenCV (`opencv-python-headless`), OpenVINO, PyTorch, PyAV (`av`), Supervision.
- **Backend API & Processing:** Python 3.11+, FastAPI, Uvicorn, WebSockets, Pydantic, Python-Multipart.
- **Frontend Dashboard:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Leaflet (interactive maps).
- **Deployment & Hosting:**
  - **Frontend:** Vercel (Edge CDN, Single-Page Application).
  - **Backend:** Cloud VPS / Local Server / Docker container with continuous RTSP & YOLO execution.

---

## AI Model Specifications

| Parameter | Specification |
| :--- | :--- |
| **Model Weights** | `backend/model/best.pt` (~40.5 MB) |
| **Architecture** | YOLO11m (`yolo11m.yaml`), Ultralytics Detect, 640px input size |
| **Detected Classes (10)** | `bike`, `bike_bike_accident`, `bike_object_accident`, `bike_person_accident`, `car`, `car_bike_accident`, `car_car_accident`, `car_object_accident`, `car_person_accident`, `person` |
| **Accident Classes** | 1, 2, 3, 5, 6, 7, 8 |
| **Default Detection Threshold** | `0.85` confidence |
| **Verification Logic** | $\ge 2$ positive inferences and $\ge 40\%$ hit ratio within a 1.5s sliding window in the presence of road context objects |

---

## Deployment Setup

### 1. Frontend on Vercel
The React + Vite dashboard is deployed to Vercel:
- **Production URL:** `https://your-vercel-deployment.vercel.app` *(Replace with your actual Vercel URL)*
- **GitHub Repository:** [https://github.com/bandarupallymanideep-oss/alooo-ba](https://github.com/bandarupallymanideep-oss/alooo-ba)
- **Branch:** `main`
- **Root Directory:** `frontend`
- **Framework Preset:** `Vite`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`
- **Environment Variable:** `VITE_BACKEND_URL`

### 2. Backend Server & Connectivity
> [!IMPORTANT]
> **Vercel is a serverless platform** designed for stateless HTTP requests. It cannot maintain persistent 24/7 RTSP video connections, run multi-threaded video capture loops, or execute heavy GPU/CPU PyTorch inference.
>
> Therefore, the **FastAPI backend runs on a dedicated server or local machine**, while the **Vercel frontend connects to it over HTTPS**.

#### Backend Connectivity Modes:
- **Local Testing via Tunnel (e.g., ngrok or Cloudflare Tunnel):** If running the backend locally on your development PC, expose port `8000`:
  ```bash
  ngrok http 8000
  ```
  Set `VITE_BACKEND_URL` in Vercel to your public tunnel URL (e.g., `https://xxxx.ngrok-free.app`).
- **Cloud VPS / Dedicated Server:** Host the FastAPI backend on a virtual machine (DigitalOcean, AWS EC2, Hetzner, etc.) using Docker or systemd, pointing `VITE_BACKEND_URL` to your server's domain or public IP.

---

## Project Structure

```text
Nirikshan/
├── backend/
│   ├── accident_clips/           # Sample test videos (read-only)
│   ├── detected_accidents/       # Generated accident video clips, JSON metadata, thumbnails
│   ├── model/
│   │   ├── best.pt               # Trained YOLO11m weights (~40.5 MB)
│   │   └── best_openvino_model/  # OpenVINO optimized export (auto-generated)
│   ├── sadarakshak/              # Core application package
│   │   ├── components/           # Detector, camera store, accident store, model loader
│   │   ├── constant/             # App constants & configuration
│   │   └── pipeline/             # Multi-threaded capture and inference sessions
│   ├── tools/                    # RTSP test server and latency measurement utilities
│   ├── app.py                    # Main FastAPI application entry point
│   ├── Dockerfile                # Production container definition with FFmpeg
│   ├── requirements.txt          # Python dependencies
│   ├── run_backend_test.py       # Comprehensive backend & pipeline test suite
│   └── .env.example              # Backend environment template
├── frontend/
│   ├── public/                   # Static branding, icons, manifest
│   ├── src/
│   │   ├── api/                  # Central HTTP/WebSocket client (uses VITE_BACKEND_URL)
│   │   ├── components/           # UI components (Cameras, Alerts, Live Monitor, Map)
│   │   ├── hooks/                # React state & query hooks
│   │   └── App.tsx               # Main dashboard router & views
│   ├── package.json              # Frontend scripts and dependencies
│   ├── tsconfig.json             # TypeScript configuration
│   ├── vercel.json               # Vercel SPA routing and security headers
│   ├── vite.config.ts            # Vite build configuration
│   └── .env.example              # Frontend environment template
└── README.md                     # Project documentation
```

---

## Prerequisites

- **Python:** 3.10 or 3.11 (64-bit)
- **Node.js:** 18.x or 20.x+ and `npm`
- **Git**
- **Hardware:**
  - *Minimum:* 4-core modern CPU, 8 GB RAM
  - *Recommended:* Dedicated NVIDIA GPU (CUDA support) or Intel Core Ultra / 11th+ Gen CPU (OpenVINO iGPU acceleration)

---

## Local Installation and Setup

### 1. Clone the Repository
```bash
git clone https://github.com/bandarupallymanideep-oss/alooo-ba.git
cd alooo-ba
```

### 2. Backend Setup (Windows)
Open PowerShell or Command Prompt in the project root:
```bat
cd backend
python -m venv venv
venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Start the FastAPI backend server:
```bat
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```
- Interactive API Docs (Swagger UI): `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

### 3. Frontend Setup (Windows)
Open a second terminal in the project root:
```bat
cd frontend
npm install
npm run dev
```
Open the printed local URL (typically `http://localhost:5173`).

### 4. Windows Security & Firewall Configuration
To discover ONVIF IP cameras and run the engine with **Windows Defender Firewall enabled**:
```powershell
# Run the auditable firewall configuration script (requests elevation):
powershell -ExecutionPolicy Bypass -File .\configure-firewall.ps1
```
- **Ensures Windows Security Remains Active:** Re-enables Domain, Private, and Public firewall profiles so the workstation is completely protected.
- **Narrowly Scoped Inbound Access:** Creates an inbound rule for `backend\venv\Scripts\python.exe` scoped strictly to `LocalSubnet` (UDP for ONVIF WS-Discovery responses and TCP port 8000 for local dashboard traffic).
- **No Public Exposure:** Port 554 (RTSP) and Port 8000 (FastAPI) are never exposed to the public Internet.

### 5. Windows Smart App Control (SAC / WDAC) Diagnostic
If Windows displays `OSError: [WinError 4551] An Application Control policy has blocked this file`:
- **Root Cause:** Windows 11 Smart App Control (Policy ID `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`) blocks unverified binaries or files containing internet Mark of the Web (`Zone.Identifier`) stored inside user profile folders (e.g., `OneDrive\Desktop` or `Downloads`).
- **Safe Remediation (Do NOT disable Windows Security):**
  1. Keep project files in a dedicated non-cloud drive/folder (e.g., `M:\Nirikshan` or `C:\SADARAKSHAK`).
  2. Strip Mark of the Web if downloaded via zip: `Unblock-File -Path .\* -Recurse`.
  3. Run the desktop application via the approved Electron runtime: `.\start-sadarakshak.ps1`.

---

## Environment Variables

### Frontend Configuration (`frontend/.env`)
| Variable | Description | Local Value | Vercel Value |
| :--- | :--- | :--- | :--- |
| `VITE_BACKEND_URL` | URL where the FastAPI backend is hosted | `http://localhost:8000` | `https://your-backend-api.com` or tunnel URL |

> In Vercel, navigate to **Project Settings $\rightarrow$ Environment Variables** and add `VITE_BACKEND_URL`.

### Backend Configuration (`backend/.env` or OS Environment)
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `ALLOWED_ORIGINS` | `""` | Comma-separated CORS allowed origins (e.g. `https://your-app.vercel.app`) |
| `SADARAKSHAK_MODEL_PATH` | `model/best.pt` | Path to trained YOLO11 weights |
| `SADARAKSHAK_INFERENCE_DEVICE` | `auto` | `auto`, `cpu`, `cuda`, `intel:gpu`, `intel:npu` |
| `SADARAKSHAK_CONFIDENCE_THRESHOLD` | `0.85` | Minimum confidence score to trigger an accident |
| `SADARAKSHAK_DISPLAY_CONFIDENCE` | `0.25` | Minimum confidence to render visual bounding box |
| `SADARAKSHAK_STREAM_DECODER_THREADS` | `1` | FFmpeg decoder threads (1 minimizes latency) |

---

## Testing & RTSP Simulation

### 1. Test Backend Pipeline
Run the automated test suite to verify model loading, frame inference, and API endpoints:
```bat
cd backend
venv\Scripts\activate
python run_backend_test.py
```

### 2. Built-in Local RTSP Test Server
Don't have a live CCTV camera? Run the built-in RTSP test server that loops test footage on your machine:
```bat
python tools\rtsp_test_server.py
```
This generates a local stream at `rtsp://127.0.0.1:8554/stream` which you can register directly inside the dashboard.

---

## Verified API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/health` | Returns backend operational status, active sessions, and model device |
| **GET** | `/docs` | Interactive OpenAPI / Swagger UI |
| **GET / POST** | `/api/cameras` | List registered cameras or add a new RTSP camera |
| **POST** | `/api/cctv/test-connection` | Validates an RTSP URL with detailed network diagnostics |
| **POST** | `/api/cameras/{id}/start` | Starts capture and YOLO11 inference on a camera |
| **POST** | `/api/cameras/{id}/stop` | Stops detection session for a camera |
| **GET** | `/api/detect/sessions/{id}/stream` | Streams real-time annotated MJPEG video |
| **GET** | `/api/accidents` | Retrieves all logged accident events with metadata |
| **GET** | `/detected_accidents/{filename}` | Serves recorded H.264 accident video clips |
| **POST** | `/api/detect/video` | Uploads a video file to run accident detection |

---

## Troubleshooting

- **Frontend Build Fails on Vercel:** Verify that the **Root Directory** in Vercel settings is set to `frontend`. Ensure `npm run build` succeeds locally before deploying.
- **Backend Offline / "Cannot reach the SADARAKSHAK backend":** Ensure the backend is running (`uvicorn app:app`) and that `VITE_BACKEND_URL` in the frontend matches the backend host exactly (with no trailing slash).
- **CORS Errors in Browser Console:** Add your frontend Vercel URL to `ALLOWED_ORIGINS` in the backend environment variables or check that it matches the regex `https://.*\.vercel\.app`.
- **RTSP Stream Fails to Connect:** Use the built-in `/api/cctv/test-connection` diagnostic tool. Common issues include invalid IP, RTSP authentication required, or firewalls blocking TCP port 554.
- **ngrok Tunnel Session Expired:** Free ngrok tunnel URLs change each time ngrok restarts. Update `VITE_BACKEND_URL` in Vercel if your tunnel address changes, or consider using a persistent domain.

---

## Future Enhancements

- Multi-camera split-screen mosaic view with custom layouts.
- Push notifications / SMS / WhatsApp alerts via Twilio or Firebase for immediate emergency dispatch.
- Integration with external traffic management centers (TMC) and emergency services dispatch APIs.
- Extended object classification (including heavy trucks, buses, and commercial transport).

---

## License

This project is developed for road safety monitoring and research. See repository license details for further terms.

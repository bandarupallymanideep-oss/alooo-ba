# SADARAKSHAK - Real-Time Road Accident Detection & Monitoring Frontend

A high-performance, dark-themed **Traffic Incident Control Room & Surveillance Console** built with React 19, Vite, TypeScript, Tailwind CSS v4, React Router v7, Lucide Icons, and Leaflet GIS.

The control room delivers real-time CCTV stream management, neural vision accident detection (YOLO telemetry), instant audio/visual incident alerts, interactive geographic pinpointing, and full forensic evidence logging.

---

## Table of Contents

1. [Quick Start & Run Steps](#quick-start--run-steps)
2. [Mock Login Credentials](#mock-login-credentials)
3. [Folder Structure](#folder-structure)
4. [Key Features & Implemented Flows](#key-features--implemented-flows)
5. [Backend Connection](#backend-connection)
6. [Known Limitations & Architecture Notes](#known-limitations--architecture-notes)

---

## Quick Start & Run Steps

### Prerequisites
- **Node.js**: v18.0.0 or later (v20+ / v24 recommended)
- **npm** or **pnpm** / **yarn**

### 1. Installation
In the project root folder:
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
The application will launch at: [http://localhost:5173/](http://localhost:5173/)

### 3. Production Build & Type Checking
```bash
npm run build
```
Runs `tsc -b` and builds production-optimized client bundles into the `dist/` directory with zero errors.

### 4. Code Quality & Linting
```bash
npm run lint
```
Executes `oxlint` across all TypeScript/TSX source files.

---

## Mock Login Credentials

The application includes an operator authentication barrier with session management. Use any of the verified demo accounts below, or click the **Quick Fill** buttons on the Login page:

| Role | Operator ID / Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Control Room Chief** *(Admin)* | `operator@trafficguard.ai` *(or `admin` / `operator`)* | `admin123` | Full Control Room Authorization |
| **Incident Analyst** | `analyst.chen@trafficguard.ai` *(or `analyst`)* | `analyst2026` | Monitoring & Forensic Review |

> **Session Persistence Note**: Checking **"Remember session on this terminal"** persists authentication in `localStorage` across full browser restarts and tab refreshes. Unchecking it stores the token in `sessionStorage`.

---

## Folder Structure

```
frontend/
├── public/                     # Static public assets
├── src/
│   ├── api/                    # Backend API client, data contracts
│   │   ├── alerts.ts           # Accidents from the backend, acknowledge / resolve
│   │   ├── auth.ts             # Operator authentication, credentials verification, tokens
│   │   ├── cameras.ts          # Camera source management (RTSP & video upload CRUD)
│   │   ├── eventEmitter.ts     # Pub/Sub event bus mimicking real-time WebSocket signals
│   │   ├── index.ts            # Centralized API export barrel
│   │   ├── mockData.ts         # Local demo operator profile (auth only)
│   │   ├── mockStorage.ts      # Operator session persistence (auth only)
│   │   └── types.ts            # TypeScript interfaces (Camera, AccidentRecord, Stats, etc.)
│   ├── assets/                 # Icons and media resources
│   ├── components/             # Reusable UI control room components
│   │   ├── AlertFilterBar.tsx  # Multi-criteria filter bar (camera, location, date, status, search)
│   │   ├── AlertTable.tsx      # Paginated/scrollable forensic accident ledger table
│   │   ├── CameraCard.tsx      # Surveillance camera node card with status cycler
│   │   ├── CameraModal.tsx     # Add/Edit camera modal (RTSP stream URL / file upload)
│   │   ├── Layout.tsx          # App shell, responsive layout, and top-level toast injection
│   │   ├── LeafletMap.tsx      # GIS map with CartoDB Dark Matter tiles & radar ping pin
│   │   ├── Sidebar.tsx         # Collapsible desktop/tablet navigation & mobile drawer
│   │   ├── StatCard.tsx        # High-impact telemetry KPI stat cards
│   │   ├── Toast.tsx           # Floating real-time critical collision toast alert
│   │   ├── TopBar.tsx          # Breadcrumb, clock, backend status, user profile
│   │   └── VideoTile.tsx       # CCTV stream viewport with scanlines & YOLO bounding boxes
│   ├── context/                # React Context Providers
│   │   ├── AlertsContext.tsx   # Polls saved accidents, badge counts, alarm
│   │   ├── AuthContext.tsx     # User session, token storage, login/logout handlers
│   │   └── CameraContext.tsx   # Camera registry and status synchronization
│   ├── pages/                  # Top-level control room views
│   │   ├── AlertDetail.tsx     # Single incident file: snapshot, video player, Leaflet GIS, notes
│   │   ├── Alerts.tsx          # Full incident log, multi-filter search, CSV exporter
│   │   ├── Dashboard.tsx       # Operations overview, KPI statistics, camera node management
│   │   ├── LiveMonitor.tsx     # CCTV video wall matrix (1x1, 2x2, 3x3), focus modal
│   │   └── Login.tsx           # Operator sign-in with quick-fill credentials
│   ├── utils/
│   │   └── audioAlarm.ts       # Web Audio API emergency dual-tone incident chime
│   ├── App.tsx                 # Protected route definitions and router layout
│   ├── index.css               # Tailwind CSS v4 directives, control room themes, scanlines
│   └── main.tsx                # React 19 application mount point
├── index.html                  # HTML entry point with dark control-room viewport settings
├── package.json                # Project dependencies and npm scripts
├── tsconfig.json               # Root TypeScript configuration
├── tsconfig.app.json           # Client app TS configuration
└── vite.config.ts              # Vite bundling configuration
```

---

## Key Features & Implemented Flows

1. **Operator Authentication**:
   - Guards all routes behind authentication; unauthenticated visits redirect to `/login`.
   - Invalid credentials display an inline error banner.
   - Session persistence via `localStorage` (if "Remember me" is checked) or `sessionStorage`.
   - Complete logout cleans sessions and returns to `/login`.

2. **Operations Dashboard & Cameras Management**:
   - 4 real-time stat cards: **Total Cameras**, **Active Streams**, **Accidents Detected Today**, and **Pending Alerts**.
   - **Add Camera Modal**: Supports both live **RTSP Stream URLs** and **Local Video File Uploads**.
   - In-place editing and deletion of camera streams.
   - Interactive status cycling directly from camera card badges (`Processing` ↔ `Connected` ↔ `Offline`).
   - All camera updates automatically propagate across Live Monitor and Alerts.

3. **Live Monitor & CCTV Matrix**:
   - Multi-tile video wall with **1x1 Solo Focus**, **2x2 Quad Grid**, and **3x3 Matrix Grid** layout toggles.
   - Real-time OSD (On-Screen Display) overlays: FPS, Resolution, Status beacon, and Location.
   - Real YOLO11 bounding boxes drawn by the backend on the live stream.
   - Click-to-fullscreen feed inspector with PTZ and telemetry controls.

4. **Incident Detection & Collision Alarm**:
   - Raised automatically when the backend saves a new accident clip.
   - Flashes an intense glowing red border on the affected camera feed.
   - Plays a synthetic two-tone emergency alert chime via the Web Audio API (can be toggled on/off).
   - Pops up a non-blocking toast alert with an immediate "Inspect Evidence" CTA.
   - Increments the real-time sidebar alert badge counter.

5. **Sequential Forensics & Persistence**:
   - Automatically generates sequential incident IDs (`accident0`, `accident1`, `accident2`, ...).
   - Stored on the backend in `backend/detected_accidents` (video, snapshot and JSON metadata).

6. **Alerts & Forensic Analysis**:
   - Comprehensive audit table of all detected traffic collisions.
   - Dynamic filters for **Camera**, **Location**, **Date Range** *(Today, Past 7 Days, Past 30 Days, All Time)*, **Severity**, and **Status**.
   - Full-text search across accident IDs, locations, camera names, and collision descriptions.
   - CSV export capability for municipal reporting.

7. **Incident Detail Page**:
   - Dual-mode media viewer: High-resolution AI snapshot with bounding boxes and Short Video Clip player.
   - Interactive Leaflet GIS map with CartoDB Dark Matter tiles and pulsing radar pinpoint.
   - Operational notes log allowing dispatchers to log unit dispatch notes and update status.
   - One-click evidence package download as a forensic JSON report (`EVIDENCE_<ID>_FORENSIC_REPORT.json`).

8. **Responsive Control Room Theme**:
   - Dark control room aesthetics with red/amber alert accents, glassmorphic panels, and CRT scanline effects.
   - Sidebar automatically collapses on tablet viewports and transforms into a sliding drawer on mobile with a hamburger menu in the top bar.

---

## Backend Connection

The frontend talks to the SADARAKSHAK FastAPI backend through one client, `src/api/client.ts`.
The backend URL is configured in `frontend/.env`:

```env
VITE_BACKEND_URL=http://localhost:8000
```

* `src/api/cameras.ts` – camera CRUD, RTSP connection test, start/stop detection, uploads, live stream URLs
* `src/api/alerts.ts` – accidents saved by the backend (`/api/accidents`), acknowledge / resolve / notes
* `CameraContext` polls cameras + live detection state; `AlertsContext` polls accidents and raises the
  toast, alarm and tile flash for every new `accidentN`.

Authentication is unchanged: the existing local operator login (see credentials above).

---

## Known Limitations & Architecture Notes

1. **RTSP Stream Playback in Browsers**:
   - Browsers cannot play `rtsp://`. The backend decodes the stream with OpenCV, runs YOLO11 and serves
     annotated frames as MJPEG (`/api/detect/sessions/{id}/stream`), shown with a plain `<img>` tag.

2. **Web Audio Autoplay Policy**:
   - Modern browsers require user interaction (e.g., clicking on the login button or anywhere on the page) before allowing audio synthesis via the Web Audio API. The app gracefully handles suspended audio contexts and resumes them automatically upon user action.

3. **Leaflet Tile Access**:
   - Map tiles are served via CartoDB Dark Matter. If deployed in an air-gapped intranet or offline control room, self-hosted vector tiles (e.g. OpenMapTiles or an offline TileServer GL) should be configured in `LeafletMap.tsx`.

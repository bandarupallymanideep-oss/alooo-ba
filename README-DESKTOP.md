# SADARAKSHAK for Windows — Desktop & Portable Package

## Real-Time Road Accident Detection & Monitoring System

SADARAKSHAK is a mission-critical traffic surveillance and AI accident detection platform designed for control rooms and emergency responders. It supports live RTSP/CCTV camera feeds, instant YOLO11 accident inference, incident video recording, and real-time hardware telemetry.

---

## 📦 Distribution Packages

### 1. Windows Installer (`SADARAKSHAK-Setup-x64.exe`)
- Standard Windows installation wizard with Start Menu and Desktop shortcuts.
- Installs to `%LOCALAPPDATA%\Programs\SADARAKSHAK`.
- Keeps user-generated accident clips and incident databases safe in `%APPDATA%\SADARAKSHAK` during upgrades.

### 2. Portable Package (`SADARAKSHAK-Windows-Portable.zip`)
- Zero-install portable edition.
- Unpack to any folder (e.g. `C:\SADARAKSHAK` or an external drive) and launch directly.

---

## ⚡ Quick Start

### Option A: Using the Installed Desktop App
1. Run `SADARAKSHAK-Setup-x64.exe`.
2. Launch **SADARAKSHAK** from the Start Menu.
3. The application automatically initializes the local backend engine and opens the Control Room interface.

### Option B: Using the Portable Package
1. Extract `SADARAKSHAK-Windows-Portable.zip`.
2. Right-click and run `install-requirements.ps1` with PowerShell (one-time setup).
3. Run `start-sadarakshak.ps1` or double-click `SADARAKSHAK.exe`.
4. To stop the application cleanly, run `stop-sadarakshak.ps1`.

---

## 🖥️ System Requirements

| Specification | Minimum | Recommended |
|---|---|---|
| **OS** | Windows 10 64-bit (1909+) or Windows 11 | Windows 11 64-bit |
| **CPU** | Intel Core i5 / AMD Ryzen 5 (4 cores) | Intel Core Ultra / 12th+ Gen (6+ cores) |
| **RAM** | 8 GB | 16 GB |
| **GPU** | None (CPU inference supported) | Intel Arc / Iris Xe (OpenVINO) or NVIDIA RTX (CUDA) |
| **Storage**| 2 GB free disk space | 5 GB SSD for accident clip buffer |

---

## 🧠 Hardware Acceleration & Inference Engines

SADARAKSHAK automatically selects the best available inference device on your workstation:
- **Intel Arc / Iris Xe / Core Ultra iGPU / NPU:** Uses OpenVINO runtime with latency mode for ~15 ms forward passes.
- **NVIDIA GeForce / RTX:** Uses PyTorch CUDA acceleration.
- **CPU Fallback:** Uses multithreaded PyTorch CPU inference if no supported accelerator is found.

---

## 🛡️ Security & Windows Application Control Notes

- **DLL Execution:** SADARAKSHAK creates isolated virtual environments inside standard user directories rather than `%TEMP%`, preventing Windows Application Control / WDAC `WinError 4551` DLL blocks.
- **Windows SmartScreen:** Because community builds are unsigned, Windows SmartScreen may show *"Windows protected your PC"*. Click **More Info** → **Run anyway**.
- **Privacy:** All CCTV streams, passwords, and accident footage remain strictly local on your workstation. No external cloud transmission occurs.

---

## 🔧 Developer Commands

```powershell
# Install dependencies & verify model
.\install-requirements.ps1

# Start backend & desktop window
.\start-sadarakshak.ps1

# Run test suite
npm run test:backend

# Stop all processes cleanly
.\stop-sadarakshak.ps1
```

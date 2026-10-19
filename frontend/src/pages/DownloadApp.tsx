import React, { useEffect, useState } from 'react';
import {
  Download,
  Laptop,
  CheckCircle,
  ShieldCheck,
  Cpu,
  HardDrive,
  Zap,
  FileArchive,
  Terminal,
  Activity,
  AlertCircle
} from 'lucide-react';
import { fetchDownloadsInfo, backendUrl } from '../api';
import type { DownloadsInfoResponse } from '../api';

export const DownloadApp: React.FC = () => {
  const [info, setInfo] = useState<DownloadsInfoResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'installer' | 'portable'>('installer');

  useEffect(() => {
    fetchDownloadsInfo()
      .then(setInfo)
      .catch(() => {
        // Fallback default info if backend is briefly offline
        setInfo({
          version: '1.0.0',
          name: 'SADARAKSHAK for Windows',
          supportedOs: 'Windows 10 / Windows 11 (64-bit)',
          requirements: {
            os: 'Windows 10 or 11 (64-bit)',
            cpu: 'Intel Core i5 / AMD Ryzen 5 or higher (4+ cores)',
            ram: '8 GB minimum (16 GB recommended)',
            gpu: 'Optional: NVIDIA CUDA GPU or Intel Arc / Iris Xe (OpenVINO AI acceleration)',
            storage: '2 GB available disk space'
          },
          downloads: [],
          installerName: 'SADARAKSHAK-Setup-x64.exe',
          portableName: 'SADARAKSHAK-Windows-Portable.zip',
        });
      });
  }, []);

  const installerArtifact = info?.downloads?.find((d) => d.type === 'installer' || d.filename.endsWith('.exe'));
  const portableArtifact = info?.downloads?.find((d) => d.type === 'portable' || d.filename.endsWith('.zip'));

  const installerUrl = installerArtifact ? backendUrl(installerArtifact.url) : backendUrl('/downloads/SADARAKSHAK-Setup-x64.exe');
  const portableUrl = portableArtifact ? backendUrl(portableArtifact.url) : backendUrl('/downloads/SADARAKSHAK-Windows-Portable.zip');

  return (
    <div className="space-y-10 max-w-6xl mx-auto pb-16">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 p-8 sm:p-12 shadow-2xl">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            <Laptop className="w-4 h-4 text-cyan-400" />
            Official Desktop Release • v{info?.version || '1.0.0'}
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Download <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">SADARAKSHAK</span> for Windows
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
            Run the complete road safety command center natively on your workstation. Includes local CCTV/RTSP camera
            monitoring, zero-latency YOLO11 neural accident detection, instant automatic accident clip recording, and
            hardware monitoring.
          </p>

          {/* Download Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <a
              href={installerUrl}
              download={info?.installerName || 'SADARAKSHAK-Setup-x64.exe'}
              className="px-6 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold flex items-center justify-center gap-3 transition-all duration-200 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5"
            >
              <Download className="w-5 h-5" />
              <div className="text-left">
                <div className="text-sm font-bold">Download Windows Installer</div>
                <div className="text-xs text-cyan-100 font-normal">
                  .exe {installerArtifact?.sizeMb ? `(${installerArtifact.sizeMb} MB)` : '• x64'}
                </div>
              </div>
            </a>

            <a
              href={portableUrl}
              download={info?.portableName || 'SADARAKSHAK-Windows-Portable.zip'}
              className="px-6 py-4 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-white font-semibold border border-slate-700 flex items-center justify-center gap-3 transition-all duration-200 hover:-translate-y-0.5"
            >
              <FileArchive className="w-5 h-5 text-cyan-400" />
              <div className="text-left">
                <div className="text-sm font-bold">Download Portable ZIP</div>
                <div className="text-xs text-slate-400 font-normal">
                  .zip {portableArtifact?.sizeMb ? `(${portableArtifact.sizeMb} MB)` : '• No setup needed'}
                </div>
              </div>
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Windows 10 / 11 64-bit
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              Fully Local & Private
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              GPU Acceleration Optional
            </span>
          </div>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white">Native Local AI Engine</h3>
          <p className="text-sm text-slate-400">
            Executes the trained YOLO11 accident model directly on your hardware using OpenVINO (Intel Arc / iGPU) or
            PyTorch CUDA (NVIDIA). No cloud latency, no bandwidth fees.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white">Continuous RTSP Monitoring</h3>
          <p className="text-sm text-slate-400">
            Connect to any IP camera or RTSP video stream with low-delay decoding, connection diagnostics, automatic
            reconnection, and real measured delivery latency tracking.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
            <HardDrive className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white">Local Evidence Archival</h3>
          <p className="text-sm text-slate-400">
            Automatically extracts pre- and post-accident footage into standard H.264 MP4 videos and snapshots, securely
            stored in your local application directory.
          </p>
        </div>
      </div>

      {/* System Requirements Section */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            System Requirements
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            SADARAKSHAK automatically selects CPU or GPU inference based on your hardware.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Minimum Requirements */}
          <div className="p-5 rounded-xl bg-slate-850/60 border border-slate-700/60 space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Minimum Requirements</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <span><strong>OS:</strong> 64-bit Windows 10 (version 1909+) or Windows 11</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <span><strong>Processor:</strong> 4-Core Intel Core i5 or AMD Ryzen 5</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <span><strong>System RAM:</strong> 8 GB RAM</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <span><strong>GPU:</strong> None required (CPU inference supported)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <span><strong>Disk Space:</strong> 2 GB free disk space</span>
              </li>
            </ul>
          </div>

          {/* Recommended Requirements */}
          <div className="p-5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-cyan-300">Recommended for High-FPS Monitoring</h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <span><strong>OS:</strong> 64-bit Windows 11</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <span><strong>Processor:</strong> 6+ Core Intel Core Ultra / 12th+ Gen or AMD Ryzen 7</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <span><strong>System RAM:</strong> 16 GB high-speed DDR4/DDR5</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <span><strong>GPU:</strong> Intel Arc / Iris Xe (OpenVINO) or NVIDIA RTX (CUDA)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <span><strong>Disk Space:</strong> 5 GB SSD storage for accident clip buffers</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Installation Guide Tabs */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-cyan-400" />
              Installation & Setup Guide
            </h2>
            <p className="text-sm text-slate-400 mt-1">Easy instructions for installing and running the desktop app.</p>
          </div>

          <div className="flex rounded-lg bg-slate-800 p-1 border border-slate-700">
            <button
              onClick={() => setActiveTab('installer')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'installer' ? 'bg-cyan-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Windows Installer (.exe)
            </button>
            <button
              onClick={() => setActiveTab('portable')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'portable' ? 'bg-cyan-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Portable ZIP Package
            </button>
          </div>
        </div>

        {activeTab === 'installer' ? (
          <div className="space-y-4">
            <div className="flex gap-4 p-4 rounded-xl bg-slate-850 border border-slate-800">
              <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                1
              </span>
              <div className="text-sm">
                <h4 className="font-semibold text-white">Download the Installer</h4>
                <p className="text-slate-400 mt-0.5">
                  Click the <strong>Download Windows Installer</strong> button above to download{' '}
                  <code className="text-cyan-300">SADARAKSHAK-Setup-x64.exe</code>.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl bg-slate-850 border border-slate-800">
              <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                2
              </span>
              <div className="text-sm">
                <h4 className="font-semibold text-white">Run the Setup</h4>
                <p className="text-slate-400 mt-0.5">
                  Double-click the installer. If Windows SmartScreen prompts: <em>"Windows protected your PC"</em>, click{' '}
                  <strong className="text-slate-200">More info</strong> and then{' '}
                  <strong className="text-slate-200">Run anyway</strong> (standard notice for custom community releases).
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl bg-slate-850 border border-slate-800">
              <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                3
              </span>
              <div className="text-sm">
                <h4 className="font-semibold text-white">Launch from Start Menu</h4>
                <p className="text-slate-400 mt-0.5">
                  The installer places a shortcut in your Start Menu and Desktop. Open SADARAKSHAK to automatically launch
                  the internal AI monitor and connect to your CCTV streams.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 p-4 rounded-xl bg-slate-850 border border-slate-800">
              <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                1
              </span>
              <div className="text-sm">
                <h4 className="font-semibold text-white">Extract the Portable ZIP</h4>
                <p className="text-slate-400 mt-0.5">
                  Extract <code className="text-cyan-300">SADARAKSHAK-Windows-Portable.zip</code> to any convenient folder
                  (e.g. <code>C:\SADARAKSHAK</code> or a USB flash drive).
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl bg-slate-850 border border-slate-800">
              <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                2
              </span>
              <div className="text-sm">
                <h4 className="font-semibold text-white">Run the One-Click Launcher</h4>
                <p className="text-slate-400 mt-0.5">
                  Right-click <code className="text-emerald-300 font-mono">start-sadarakshak.ps1</code> or run{' '}
                  <code className="text-emerald-300 font-mono">SADARAKSHAK.exe</code>. The script automatically verifies
                  Python prerequisites, verifies YOLO model weights, and opens the application window.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl bg-slate-850 border border-slate-800">
              <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                3
              </span>
              <div className="text-sm">
                <h4 className="font-semibold text-white">Stop Any Time</h4>
                <p className="text-slate-400 mt-0.5">
                  Closing the application window or running <code className="text-slate-300 font-mono">stop-sadarakshak.ps1</code>{' '}
                  cleanly terminates all background monitoring processes without leaving orphan ports.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Security & Application Control Notice */}
      <div className="rounded-2xl bg-slate-900/60 border border-amber-500/20 p-6 space-y-3">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <h3 className="text-sm font-semibold">Security & Windows Application Control Information</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          SADARAKSHAK executes entirely on your workstation without transmitting CCTV footage or camera passwords to
          external servers. The application creates isolated virtual environments inside standard user application
          directories rather than <code>%TEMP%</code>, fully adhering to Windows Defender Application Control (WDAC)
          policies and preventing WinError 4551 DLL blocks.
        </p>
      </div>
    </div>
  );
};

export default DownloadApp;

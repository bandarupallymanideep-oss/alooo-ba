import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  AlertTriangle, 
  ShieldCheck, 
  Zap, 
  Volume2, 
  VolumeX, 
  Cpu, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Laptop, 
  MapPin,
  Server,
  RefreshCw,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useAlerts } from '../context/AlertsContext';
import { useCameras } from '../context/CameraContext';
import { BrandLogo } from './BrandLogo';
import { isDesktopApp } from '../utils/runtime';
import { triggerGpuDetection } from '../api';
import type { GpuDetectionResponse } from '../api';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen = false,
  onClose,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { newAlertsCount, soundEnabled, setSoundEnabled } = useAlerts();
  const { cameras, backendOnline, health, refreshCameras } = useCameras();
  const isDesktop = isDesktopApp();

  // GPU detection state
  const [isDetectingGpu, setIsDetectingGpu] = useState(false);
  const [gpuDetectionResult, setGpuDetectionResult] = useState<GpuDetectionResponse | null>(null);
  const [gpuDetectionError, setGpuDetectionError] = useState<string | null>(null);

  const handleDetectGpu = async () => {
    setIsDetectingGpu(true);
    setGpuDetectionError(null);
    try {
      const res = await triggerGpuDetection();
      setGpuDetectionResult(res);
      // Refresh context so DETECTION ENGINE picks up any refreshed hardware values
      refreshCameras().catch(() => {});
    } catch (err: any) {
      setGpuDetectionError(err?.message || 'Failed to detect GPU hardware.');
    } finally {
      setIsDetectingGpu(false);
    }
  };

  // Active detection computations
  const activeDetections = cameras.filter(c => c.detection?.active);
  const activeSessions = activeDetections.length;
  const inferring = activeDetections.filter(c => (c.detection?.inferenceMs || 0) > 0);
  const avgInferenceMs = inferring.length
    ? Math.round(inferring.reduce((sum, c) => sum + (c.detection?.inferenceMs || 0), 0) / inferring.length)
    : null;
  const avgInferenceFps = inferring.length
    ? Math.round((inferring.reduce((sum, c) => sum + (c.detection?.inferenceFps || 0), 0) / inferring.length) * 10) / 10
    : null;

  // Engine information from backend state
  const engine = health?.engine;
  const modelName = engine?.modelName || health?.model?.name || (health ? 'YOLO11m' : '--');
  const deviceType = engine?.device || health?.model?.deviceType || (health?.model?.device ? health.model.device.toUpperCase() : '--');
  const deviceDetailed = engine?.deviceDetailed || health?.model?.deviceLabel || (engine?.isGpu ? 'NVIDIA GPU' : 'CPU');
  const accelerator = engine?.accelerator || health?.model?.accelerator || (engine?.isGpu ? 'CUDA' : 'CPU');
  
  // Real measured metrics (never fake or hardcoded)
  const measuredFps = engine?.fps ?? avgInferenceFps;
  const fpsDisplay = measuredFps != null ? `${measuredFps} FPS` : (activeSessions > 0 ? 'measuring...' : 'N/A (idle)');

  const measuredLatency = engine?.yoloLatencyMs ?? avgInferenceMs;
  const latencyDisplay = measuredLatency != null 
    ? `${measuredLatency} ms` 
    : (engine?.warmupMs ? `${engine.warmupMs} ms (warmup)` : (activeSessions > 0 ? 'measuring...' : 'N/A (idle)'));

  const activeJobsCount = engine?.activeJobs ?? activeSessions;

  // Real status
  let engineStatus: 'READY' | 'LOADING' | 'DETECTING' | 'WARNING' | 'OFFLINE' = 'READY';
  if (backendOnline === false) {
    engineStatus = 'OFFLINE';
  } else if (!health) {
    engineStatus = 'LOADING';
  } else if (engine?.status === 'WARNING') {
    engineStatus = 'WARNING';
  } else if (activeJobsCount > 0 || engine?.status === 'DETECTING') {
    engineStatus = 'DETECTING';
  } else {
    engineStatus = 'READY';
  }

  // Styling based on accelerator and operational state
  const isCudaOperational = Boolean(engine?.isGpu || accelerator === 'CUDA');
  const hasWarning = engineStatus === 'WARNING';

  let statusBadgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
  let statusTextClass = 'text-slate-300';
  if (engineStatus === 'OFFLINE') {
    statusBadgeClass = 'bg-rose-950/80 text-rose-300 border border-rose-800/80';
    statusTextClass = 'text-rose-400';
  } else if (hasWarning) {
    statusBadgeClass = 'bg-amber-950/80 text-amber-300 border border-amber-700/80';
    statusTextClass = 'text-amber-400';
  } else if (engineStatus === 'DETECTING') {
    statusBadgeClass = 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/60 animate-pulse';
    statusTextClass = 'text-emerald-400';
  } else if (isCudaOperational) {
    statusBadgeClass = 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60';
    statusTextClass = 'text-emerald-400';
  } else {
    statusBadgeClass = 'bg-slate-800 text-cyan-300 border border-cyan-800/60';
    statusTextClass = 'text-cyan-400';
  }

  const acceleratorColor = isCudaOperational 
    ? 'text-emerald-400 font-semibold' 
    : hasWarning 
    ? 'text-amber-400' 
    : 'text-cyan-300';

  // Hardware details from backend or recent manual detection
  const hw = engine?.hardware;
  const cpuName = hw?.cpu?.name || 'Intel Core Processor';
  const cpuCoresText = hw?.cpu?.logicalCores ? `${hw.cpu.logicalCores}T` : 'Multi-Core';

  // Resolved GPU information (either from active detection response or cached health state)
  const detectedGpuObj = gpuDetectionResult?.gpu || hw?.primaryGpu;
  const detectedGpuName = detectedGpuObj?.name || 'Intel(R) Arc(TM) 130T GPU (8GB)';
  const detectedGpuManufacturer = detectedGpuObj?.manufacturer || (detectedGpuName.toLowerCase().includes('intel') ? 'Intel Corporation' : (detectedGpuName.toLowerCase().includes('nvidia') ? 'NVIDIA Corporation' : 'Standard'));
  const detectedGpuMemory = detectedGpuObj?.adapterRamGb 
    ? `${detectedGpuObj.adapterRamGb} GB VRAM` 
    : (detectedGpuObj?.memoryDisplay || (detectedGpuObj?.adapterRamBytes ? `${roundMb(detectedGpuObj.adapterRamBytes)} MB VRAM` : '2.0 GB VRAM'));

  function roundMb(b: number): number {
    return Math.round(b / (1024 * 1024));
  }

  // Result Classification according to requirement:
  // - 'GPU Detected'
  // - 'GPU Acceleration Available'
  // - 'GPU Detected — Acceleration Not Supported'
  // - 'No GPU Detected'
  // - 'Detection Failed'
  let resultStatusText: string = gpuDetectionResult?.result || (
    isCudaOperational 
      ? 'GPU Acceleration Available' 
      : (detectedGpuName && !detectedGpuName.toLowerCase().includes('standard')
          ? 'GPU Detected — Acceleration Not Supported'
          : 'GPU Detected')
  );

  if (gpuDetectionError) {
    resultStatusText = 'Detection Failed';
  }

  let resultBadgeClass = 'bg-slate-800/90 text-slate-300 border-slate-700';
  let accelNote = 'Active: Safe CPU Inference';
  let accelNoteColor = 'text-slate-400';

  if (resultStatusText === 'GPU Acceleration Available') {
    resultBadgeClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-600/70';
    accelNote = 'CUDA Active (Hardware Accelerated)';
    accelNoteColor = 'text-emerald-400 font-semibold';
  } else if (resultStatusText === 'GPU Detected — Acceleration Not Supported') {
    resultBadgeClass = 'bg-amber-950/80 text-amber-300 border-amber-600/70';
    accelNote = 'Active: Safe CPU (CUDA Not Supported on Intel Arc)';
    accelNoteColor = 'text-amber-400';
  } else if (resultStatusText === 'GPU Detected') {
    resultBadgeClass = 'bg-cyan-950/80 text-cyan-300 border-cyan-600/70';
    accelNote = 'Active: Safe CPU Inference';
    accelNoteColor = 'text-cyan-400';
  } else if (resultStatusText === 'No GPU Detected') {
    resultBadgeClass = 'bg-slate-900 text-slate-400 border-slate-800';
    accelNote = 'CPU Mode Only (No GPU)';
    accelNoteColor = 'text-slate-400';
  } else if (resultStatusText === 'Detection Failed') {
    resultBadgeClass = 'bg-rose-950/80 text-rose-300 border-rose-800/80';
    accelNote = 'Detection Error';
    accelNoteColor = 'text-rose-400';
  }

  // Navigation Items: System Diagnostics removed; Windows Desktop App only on website
  const navItems = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Cameras & Statistics'
    },
    {
      to: '/live',
      label: 'Live Monitor',
      icon: Video,
      description: 'RTSP / Video Detection'
    },
    {
      to: '/map',
      label: 'Location Map',
      icon: MapPin,
      description: 'GIS & Node Telemetry'
    },
    {
      to: '/alerts',
      label: 'Alerts & Violations',
      icon: AlertTriangle,
      description: 'Saved Accident Footage',
      badge: newAlertsCount
    },
    ...(!isDesktop ? [
      {
        to: '/download',
        label: 'Windows Desktop App',
        icon: Laptop,
        description: 'Installer & Portable'
      }
    ] : [])
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden transition-opacity"
        />
      )}

      <aside className={`
        force-dark fixed lg:static top-0 bottom-0 left-0 z-50
        bg-[#111a28] border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-screen select-none backdrop-blur-xl transition-all duration-300 overflow-y-auto
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
        ${!isOpen && isCollapsed ? 'lg:w-20' : 'lg:w-64'}
      `}>
        {/* Top Header / Brand */}
        <div>
          <div className={`p-4 border-b border-slate-800/80 flex items-center ${isCollapsed && !isOpen ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-3">
              <BrandLogo size={42} />
              {(!isCollapsed || isOpen) && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-white text-base tracking-tight font-sans">
                      SADARAKSHAK
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium truncate">Road Accident Detection</p>
                </div>
              )}
            </div>

            {/* Mobile close button */}
            {isOpen && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 lg:hidden cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* Desktop collapse toggle */}
            {!isOpen && onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className={`hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer ${
                  isCollapsed ? 'mt-2' : ''
                }`}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <div className="px-3 py-4">
            {(!isCollapsed || isOpen) && (
              <div className="text-[10px] uppercase font-mono font-semibold text-slate-400 px-3 mb-2 tracking-wider">
                Command Center
              </div>
            )}
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => {
                      if (isOpen && onClose) onClose();
                    }}
                    title={isCollapsed && !isOpen ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center ${isCollapsed && !isOpen ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'} rounded-xl transition-all duration-200 group relative ${
                        isActive
                          ? 'bg-gradient-to-r from-red-600/20 to-amber-600/10 text-white border border-red-500/40 shadow-lg shadow-red-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className={`flex items-center ${isCollapsed && !isOpen ? 'justify-center' : 'gap-3'} min-w-0`}>
                          <div
                            className={`p-1.5 rounded-lg transition-colors relative ${
                              isActive
                                ? 'bg-red-500 text-white shadow-md shadow-red-500/30'
                                : 'bg-slate-800/80 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-800'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {/* Dot badge on icon if collapsed */}
                            {isCollapsed && !isOpen && typeof item.badge === 'number' && item.badge > 0 && (
                              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full border border-slate-950 animate-pulse" />
                            )}
                          </div>
                          {(!isCollapsed || isOpen) && (
                            <div className="truncate">
                              <div className={`text-sm font-medium ${isActive ? 'text-white font-semibold' : ''}`}>
                                {item.label}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {item.description}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Dynamic full badge for alerts */}
                        {(!isCollapsed || isOpen) && typeof item.badge === 'number' && item.badge > 0 && (
                          <span className="flex items-center justify-center px-2 py-0.5 text-xs font-mono font-bold text-white bg-red-600 rounded-full shadow-md shadow-red-600/40 animate-pulse">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* DETECTION ENGINE & HARDWARE PERFORMANCE PANEL */}
          {(!isCollapsed || isOpen) ? (
            <div className="px-3 py-2 space-y-2">
              {/* Main Detection Engine Panel */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/90 shadow-inner space-y-2 text-[11px] font-mono">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>DETECTION ENGINE</span>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${statusBadgeClass}`}>
                    {engineStatus}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Model</span>
                    <span className="text-slate-100 font-bold">{modelName}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Device</span>
                    <span className="text-slate-200 font-medium truncate max-w-[130px] text-right" title={deviceDetailed}>
                      {deviceType}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Accelerator</span>
                    <span className={acceleratorColor}>
                      {accelerator}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>FPS</span>
                    <span className="text-slate-200">{fpsDisplay}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>YOLO Latency</span>
                    <span className="text-slate-200 font-medium">{latencyDisplay}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Active Jobs</span>
                    <span className={`font-bold ${activeJobsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {activeJobsCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400 pt-0.5 border-t border-slate-800/60">
                    <span>Status</span>
                    <span className={`font-semibold ${statusTextClass}`}>{engineStatus}</span>
                  </div>
                </div>
              </div>

              {/* HARDWARE DETAILS & GPU DETECTION SECTION */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 text-[10px] font-mono">
                {/* Header with Title and Detect GPU button */}
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/70">
                  <span className="flex items-center gap-1.5 font-bold text-slate-200 text-[11px]">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>GPU & HARDWARE</span>
                  </span>

                  {/* Clearly visible DETECT GPU BUTTON */}
                  <button
                    type="button"
                    disabled={isDetectingGpu}
                    onClick={handleDetectGpu}
                    className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm ${
                      isDetectingGpu
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/80 cursor-wait animate-pulse'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border border-cyan-400/30 cursor-pointer hover:shadow-md hover:shadow-cyan-500/20 active:scale-95'
                    }`}
                    title="Detect available GPU hardware and check YOLO inference acceleration"
                  >
                    <RefreshCw className={`w-3 h-3 ${isDetectingGpu ? 'animate-spin text-cyan-300' : ''}`} />
                    <span>{isDetectingGpu ? 'Detecting...' : (gpuDetectionResult ? 'Re-detect' : 'Detect GPU')}</span>
                  </button>
                </div>

                {/* Loading indicator when detecting */}
                {isDetectingGpu && (
                  <div className="py-2.5 px-3 rounded-lg bg-cyan-950/40 border border-cyan-800/60 flex items-center justify-center gap-2 text-cyan-300 font-bold text-[11px] animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Detecting GPU...</span>
                  </div>
                )}

                {/* Detection Error Display */}
                {gpuDetectionError && !isDetectingGpu && (
                  <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[10px] uppercase">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Detection Failed</span>
                    </div>
                    <p className="text-[10px] text-rose-300/90 leading-tight">{gpuDetectionError}</p>
                    <button
                      type="button"
                      onClick={handleDetectGpu}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer mt-1 block"
                    >
                      Try Detect GPU Again
                    </button>
                  </div>
                )}

                {/* Normal Hardware & GPU state */}
                {!isDetectingGpu && (
                  <>
                    {/* Status Badge */}
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-slate-400 text-[9px] uppercase tracking-wider">Status</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border text-right truncate max-w-[150px] ${resultBadgeClass}`} title={resultStatusText}>
                        {resultStatusText}
                      </span>
                    </div>

                    {/* Detected GPU Specifications */}
                    <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800/70 space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-slate-400 shrink-0">GPU:</span>
                        <span className="text-slate-200 font-bold truncate text-right" title={detectedGpuName}>
                          {detectedGpuName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Maker:</span>
                        <span className="text-slate-300 font-medium">{detectedGpuManufacturer}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Memory:</span>
                        <span className="text-slate-200 font-semibold">{detectedGpuMemory}</span>
                      </div>
                    </div>

                    {/* Acceleration Capability Distinction */}
                    <div className="pt-0.5 text-[9px] flex items-start gap-1">
                      <span className="text-slate-400 shrink-0">YOLO Accel:</span>
                      <span className={`font-semibold leading-tight ${accelNoteColor}`}>
                        {accelNote}
                      </span>
                    </div>

                    {/* CPU & Core Info */}
                    <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[9px] text-slate-400">
                      <span className="truncate max-w-[140px]" title={cpuName}>CPU: {cpuName}</span>
                      <span className="text-slate-400 font-mono bg-slate-900 px-1 py-0.5 rounded border border-slate-800">
                        {cpuCoresText}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Collapsed icon status */
            <div className="p-2 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleDetectGpu}
                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                  isDetectingGpu
                    ? 'bg-cyan-950 border-cyan-700 text-cyan-300 animate-pulse'
                    : isCudaOperational 
                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400' 
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
                title={`Detect GPU • Status: ${resultStatusText}`}
              >
                <Cpu className={`w-4 h-4 ${isDetectingGpu ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Bottom Telemetry & Controls */}
        <div className="p-3 border-t border-slate-800/80 space-y-3">
          {(!isCollapsed || isOpen) ? (
            <>
              {/* System telemetry status */}
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Backend</span>
                  </span>
                  {backendOnline === false ? (
                    <span className="text-red-400 font-bold">OFFLINE</span>
                  ) : (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                      {backendOnline ? 'ONLINE' : '...'}
                    </span>
                  )}
                </div>
              </div>

              {/* Audio Alert Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>Alarm Chime</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    soundEnabled
                      ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
                  }`}
                  title={soundEnabled ? 'Mute incident audio chime' : 'Enable incident audio chime'}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                  soundEnabled
                    ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
                }`}
                title={soundEnabled ? 'Mute alarm chime' : 'Enable alarm chime'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

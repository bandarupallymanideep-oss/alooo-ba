import React, { useEffect, useState } from 'react';
import {
  Cpu,
  HardDrive,
  Activity,
  Zap,
  Server,
  Video,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Layers,
  ArrowDownToLine,
  Info,
  FileText,
  FolderOpen
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchSystemDiagnostics } from '../api';
import type { DiagnosticsResponse } from '../api';

export const SystemDiagnostics: React.FC = () => {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [desktopInfo, setDesktopInfo] = useState<any>(null);
  const [restarting, setRestarting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const loadDesktopInfo = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getBackendInfo) {
      (window as any).electronAPI.getBackendInfo().then((info: any) => {
        setDesktopInfo(info);
      }).catch(() => {});
    }
  };

  const handleRestartBackend = async () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.restartBackend) {
      setRestarting(true);
      try {
        await (window as any).electronAPI.restartBackend();
        await loadData(false);
        loadDesktopInfo();
      } finally {
        setRestarting(false);
      }
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchSystemDiagnostics();
      setData(res);
      setError(null);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err?.message || 'Unable to connect to SADARAKSHAK backend diagnostics');
    } finally {
      if (!silent) setLoading(false);
    }
    loadDesktopInfo();
  };

  useEffect(() => {
    loadData();
    loadDesktopInfo();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-700/60 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">System & AI Diagnostics</h1>
              <p className="text-sm text-slate-400">
                Hardware inspection, YOLO11 inference benchmarks, and real-time RTSP stream performance
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title={autoRefresh ? 'Live refresh active (2s)' : 'Auto refresh paused'}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            {autoRefresh ? 'Live Polling' : 'Paused'}
          </button>

          <button
            onClick={() => loadData(false)}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <Link
            to="/download"
            className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Get Desktop App
          </Link>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-rose-400" />
          <div className="text-sm">
            <p className="font-semibold text-rose-200">Backend Diagnostics Offline</p>
            <p className="mt-0.5">{error}</p>
            <p className="mt-1 text-xs text-rose-400">
              Ensure the SADARAKSHAK FastAPI backend is running on <code>http://127.0.0.1:8000</code>
            </p>
          </div>
        </div>
      )}

      {/* Desktop Process Manager Status (Active in Windows Desktop App) */}
      {desktopInfo && (
        <div className="rounded-2xl border border-sky-500/30 bg-slate-900/90 p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <Server className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  Windows Desktop Process Engine
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                    desktopInfo.status === 'ready'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${desktopInfo.status === 'ready' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    {desktopInfo.status === 'ready' ? (desktopInfo.isManaged ? 'Managed (PID ' + desktopInfo.pid + ')' : 'External Process (Connected)') : desktopInfo.status}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Automated background lifecycle &bull; Port: <span className="font-mono text-sky-300">{desktopInfo.port}</span> &bull; URL: <span className="font-mono text-sky-300">{desktopInfo.url}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => (window as any).electronAPI?.openLogFile?.()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Open backend.log in text editor"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                View Log File
              </button>
              <button
                onClick={() => (window as any).electronAPI?.openFolder?.(desktopInfo.detectedAccidentsDir)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Open detected accidents folder in Windows Explorer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                Accident Clips
              </button>
              <button
                onClick={handleRestartBackend}
                disabled={restarting}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${restarting ? 'animate-spin' : ''}`} />
                {restarting ? 'Restarting...' : 'Restart Backend'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1 border-t border-slate-800">
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 block mb-0.5">YOLO11 Model Status</span>
              <span className="font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {desktopInfo.yoloReady ? 'Model Loaded & Hot in Memory' : 'Initializing Model...'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 block mb-0.5">Log File Path</span>
              <span className="font-mono text-slate-300 truncate block" title={desktopInfo.logFile}>
                {desktopInfo.logFile}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 block mb-0.5">Data Storage Directory</span>
              <span className="font-mono text-slate-300 truncate block" title={desktopInfo.userDataDir}>
                {desktopInfo.userDataDir}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Primary Inference Device Banner */}
      {data && (
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-6 shadow-xl shadow-cyan-950/20">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                Active Acceleration Engine
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-3">
                {data.ai.deviceIndicator}
              </h2>
              <p className="text-sm text-slate-400 max-w-2xl">
                {data.ai.isGpuAccelerated
                  ? `Hardware-accelerated deep learning inference via ${data.ai.engine.toUpperCase()} executing on ${data.system.gpu.name}.`
                  : `CPU-only inference mode active. Model is executing using PyTorch CPU instructions.`}
              </p>
            </div>

            <div className="flex items-center gap-4 bg-slate-800/80 p-4 rounded-xl border border-slate-700/60 shrink-0">
              <div className="text-center px-3 border-r border-slate-700">
                <span className="text-xs uppercase text-slate-400 block font-medium">Inference Latency</span>
                <span className="text-2xl font-bold text-cyan-400">
                  {data.performance.inferenceLatencyMs !== null
                    ? `${data.performance.inferenceLatencyMs} ms`
                    : `${data.ai.warmupMs} ms`}
                </span>
              </div>
              <div className="text-center px-3">
                <span className="text-xs uppercase text-slate-400 block font-medium">Warmup Forward</span>
                <span className="text-2xl font-bold text-emerald-400">{data.ai.warmupMs} ms</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CPU Card */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-cyan-400" />
                CPU Utilization
              </span>
              <span className="text-xs font-semibold text-slate-300">{data.system.cpu.logicalCores} Logical Cores</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-white">{data.system.cpu.usagePercent}%</span>
              <span className="text-xs text-slate-400 truncate max-w-[150px]" title={data.system.cpu.name}>
                {data.system.cpu.name}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  data.system.cpu.usagePercent > 85
                    ? 'bg-rose-500'
                    : data.system.cpu.usagePercent > 60
                    ? 'bg-amber-500'
                    : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, data.system.cpu.usagePercent))}%` }}
              />
            </div>
          </div>

          {/* RAM Card */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                RAM Memory
              </span>
              <span className="text-xs font-semibold text-slate-300">
                {data.system.ram.availableGb} GB free
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-white">{data.system.ram.usagePercent}%</span>
              <span className="text-xs text-slate-400">
                {data.system.ram.usedGb} / {data.system.ram.totalGb} GB
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  data.system.ram.usagePercent > 85 ? 'bg-rose-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, data.system.ram.usagePercent))}%` }}
              />
            </div>
          </div>

          {/* Processing Latency Card */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-amber-400" />
                Processing Latency
              </span>
              <span className="text-xs font-semibold text-slate-300">Decode + Overlay</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-white">
                {data.performance.processingLatencyMs !== null
                  ? `${data.performance.processingLatencyMs} ms`
                  : 'Idle'}
              </span>
              <span className="text-xs text-slate-400">
                {data.performance.videoProcessingFps !== null ? `${data.performance.videoProcessingFps} FPS` : 'Ready'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Time to decode frame, apply bounding boxes, and encode MJPEG
            </p>
          </div>

          {/* Stream End-to-End Latency Card */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Video className="w-4 h-4 text-purple-400" />
                Stream Delivery Delay
              </span>
              <span className="text-xs font-semibold text-purple-400">
                {data.performance.activeStreams} Active Camera(s)
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-white">
                {data.performance.deliveryLatencyMs !== null
                  ? `${data.performance.deliveryLatencyMs} ms`
                  : 'Low Delay'}
              </span>
              <span className="text-xs text-slate-400">
                {data.performance.frameErrors > 0 ? `${data.performance.frameErrors} drop` : '0 drops'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Measured delay from capture timestamp to client socket delivery
            </p>
          </div>
        </div>
      )}

      {/* Latency Disambiguation Guide */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Real Latency Breakdown & Disambiguation</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 space-y-1">
            <div className="font-semibold text-cyan-300">A. YOLO Inference Latency</div>
            <p>
              The actual time the neural network forward pass takes per frame (e.g. ~{data?.ai.warmupMs || 15} ms with{' '}
              {data?.ai.engine || 'OpenVINO'}). This is strictly model execution.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 space-y-1">
            <div className="font-semibold text-amber-300">B. Processing Latency</div>
            <p>
              Total backend pipeline time per frame: OpenCV frame grab, aspect downscaling, drawing accident boxes, and
              JPEG encoding.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 space-y-1">
            <div className="font-semibold text-purple-300">C. Stream Delivery Latency</div>
            <p>
              The measured delay between when a camera produces a frame and when it is served to the viewer over HTTP/MJPEG
              (optimized with 1-thread H.264 decoding and low_delay flags).
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Technical Tables */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hardware & GPU Details */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                Host Machine Specification
              </h3>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {data.system.os}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Processor (CPU)</span>
                <span className="font-medium text-slate-200 text-right">{data.system.cpu.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">CPU Cores</span>
                <span className="font-medium text-slate-200">
                  {data.system.cpu.logicalCores} logical ({data.system.cpu.physicalCores} physical)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Primary GPU Device</span>
                <span className="font-medium text-slate-200 text-right">{data.system.gpu.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">GPU VRAM / Memory</span>
                <span className="font-medium text-slate-200">
                  {data.system.gpu.vramGb ? `${data.system.gpu.vramGb} GB` : 'Shared System Memory'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">GPU Driver Version</span>
                <span className="font-medium text-slate-200">{data.system.gpu.driverVersion || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">NVIDIA CUDA Runtime</span>
                <span
                  className={`font-semibold flex items-center gap-1.5 ${
                    data.system.gpu.cuda.supported ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {data.system.gpu.cuda.supported ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      CUDA Available ({data.system.gpu.cuda.deviceName || 'Active'})
                    </>
                  ) : (
                    'Not Available (Intel Arc / CPU Host)'
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Intel OpenVINO Engines</span>
                <span className="font-medium text-cyan-400">
                  {data.system.gpu.openvinoDevices.length > 0
                    ? data.system.gpu.openvinoDevices.map((d) => d.device).join(', ')
                    : 'Not Installed'}
                </span>
              </div>
            </div>
          </div>

          {/* AI Model & Pipeline Diagnostics */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                YOLO11 Model & Detection Pipeline
              </h3>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                Model Ready
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Model Weights</span>
                <span className="font-medium text-slate-200 font-mono text-xs">{data.ai.modelFile}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Active Inference Engine</span>
                <span className="font-semibold text-cyan-400 uppercase">
                  {data.ai.engine} ({data.ai.device})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Target Classes ({data.ai.classesCount})</span>
                <span className="font-medium text-slate-300 text-xs truncate max-w-[220px]" title="Accident & Vehicle Classes">
                  Car, Bike, Person, Multi-vehicle Collisions
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Detection Confidence Gate</span>
                <span className="font-medium text-slate-200">{data.ai.confidenceThreshold * 100}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Backend Uptime</span>
                <span className="font-medium text-slate-200 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {formatUptime(data.backend.uptimeSeconds)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Saved Accident Clips</span>
                <span className="font-medium text-emerald-400">{data.backend.accidentsSaved} incidents recorded</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Streams Table */}
      {data && data.streamDiagnostics.sessions.length > 0 && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Video className="w-4 h-4 text-cyan-400" />
            Live Stream Sessions & Latency Telemetry
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-800/60 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Session</th>
                  <th className="py-2.5 px-3">Source Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Resolution</th>
                  <th className="py-2.5 px-3">FPS</th>
                  <th className="py-2.5 px-3">YOLO Latency</th>
                  <th className="py-2.5 px-3">Delivery Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.streamDiagnostics.sessions.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-medium text-white">{s.cameraName || s.id}</td>
                    <td className="py-2.5 px-3 uppercase text-xs text-slate-400">{s.sourceType}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {s.state}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-400">{s.resolution || 'N/A'}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">{s.captureFps || 0} FPS</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-cyan-400">{s.inferenceMs || 0} ms</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-purple-400">{s.latency?.deliveryMs || 'Low'} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2 pt-2 border-t border-slate-800">
        <span>SADARAKSHAK Diagnostics Engine v1.0 • Windows 10/11 Architecture</span>
        <span>Last updated: {lastRefreshed.toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

export default SystemDiagnostics;

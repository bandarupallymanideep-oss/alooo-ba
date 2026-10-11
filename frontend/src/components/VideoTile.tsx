import React, { useState, useEffect } from 'react';
import {
  Maximize2,
  MapPin,
  AlertTriangle,
  Radio,
  Play,
  Square,
  Loader2,
  Camera as CameraIcon,
  Gauge
} from 'lucide-react';
import type { Camera } from '../api/types';
import { useCameras } from '../context/CameraContext';
import { detectionSnapshotUrl, detectionStreamUrl } from '../api/cameras';
import { getDetectionBadge } from '../utils/detectionStatus';
import { CameraActionsMenu } from './CameraActionsMenu';

interface VideoTileProps {
  camera: Camera;
  isFlashing?: boolean;
  onExpand?: (camera: Camera) => void;
  showAiOverlay?: boolean;
  compact?: boolean;
}

/**
 * Live CCTV tile. The browser never opens rtsp:// itself: the backend decodes the
 * stream, runs YOLO11 and serves the annotated frames as MJPEG for this <img>.
 */
export const VideoTile: React.FC<VideoTileProps> = ({
  camera,
  isFlashing = false,
  onExpand,
  showAiOverlay = true,
  compact = false
}) => {
  const { startDetection, stopDetection } = useCameras();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const det = camera.detection;
  const active = !!det?.active;
  const badge = getDetectionBadge(det);
  const accidentNow = det?.state === 'accident';
  const latencyMs = det?.latency?.deliveryMs;

  // live stream while detection runs, last annotated frame afterwards, else the camera thumbnail
  const imageSrc = active
    ? detectionStreamUrl(camera.id, showAiOverlay, det?.startedAt)
    : det && det.framesProcessed > 0
    ? detectionSnapshotUrl(camera.id, det.endedAt || det.startedAt)
    : camera.thumbnailUrl || '';
  const imgFailed = failedSrc === imageSrc;

  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 8000);
    return () => clearTimeout(t);
  }, [actionError]);

  const handleToggleDetection = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    setActionError(null);
    try {
      if (active) await stopDetection(camera.id);
      else await startDetection(camera.id);
    } catch (err: any) {
      setActionError(err?.message || 'Unable to start detection.');
    } finally {
      setBusy(false);
    }
  };

  const errorMessage = actionError || (det && ['error', 'disconnected', 'reconnecting'].includes(det.state) ? det.error?.message || det.message : null);

  return (
    <div
      onClick={() => onExpand?.(camera)}
      className={`force-dark relative group rounded-2xl bg-black overflow-hidden border transition-all duration-300 cursor-pointer shadow-xl aspect-video flex flex-col justify-between ${
        isFlashing || accidentNow
          ? 'animate-accident-flash border-red-500 ring-4 ring-red-500/50 z-20'
          : active
          ? 'border-slate-700 hover:border-slate-500'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Feed content */}
      <div className="absolute inset-0 bg-slate-950 flex items-center justify-center overflow-hidden">
        {imageSrc && !imgFailed ? (
          <img
            src={imageSrc}
            alt={camera.name}
            onError={() => setFailedSrc(imageSrc)}
            className={`w-full h-full object-contain transition-opacity duration-500 ${active ? '' : 'opacity-55'}`}
          />
        ) : (
          <div className="text-center p-6 select-none">
            {camera.sourceType === 'rtsp' ? (
              <Radio className="w-10 h-10 mx-auto text-slate-700 mb-2" />
            ) : (
              <CameraIcon className="w-10 h-10 mx-auto text-slate-700 mb-2" />
            )}
            <p className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest">NO LIVE FEED</p>
            <p className="text-[11px] text-slate-600 mt-1 font-mono">Press START to connect and run YOLO11 detection</p>
          </div>
        )}

        <div className="absolute inset-0 scanlines opacity-20 pointer-events-none" />

        {accidentNow && (
          <div className="absolute inset-x-0 top-14 z-20 flex justify-center pointer-events-none">
            <div className="px-4 py-1.5 rounded-full bg-red-600/90 border border-red-400 text-white font-mono text-xs font-black tracking-wider flex items-center gap-2 shadow-2xl shadow-red-600/80 animate-pulse">
              <AlertTriangle className="w-4 h-4 fill-white" />
              <span>ACCIDENT DETECTED · RECORDING {det?.recordingAccidentId}</span>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="absolute inset-x-3 bottom-16 z-20 pointer-events-none">
            <div className="px-3 py-2 rounded-lg bg-red-950/90 border border-red-500/50 text-red-200 text-[11px] font-mono leading-snug">
              {errorMessage}
            </div>
          </div>
        )}
      </div>

      {/* Top bar: live indicator, name, detection state, menu */}
      <div className="relative z-10 p-3 flex items-start justify-between gap-2 text-xs font-mono select-none bg-gradient-to-b from-black/85 via-black/40 to-transparent">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {active ? (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-600/90 text-white text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-white live-dot" /> LIVE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> OFFLINE
              </span>
            )}
            <span className="text-white font-bold drop-shadow tracking-tight truncate">{camera.name}</span>
          </div>
          {!compact && (
            <div className="flex items-center gap-1 text-[11px] text-slate-300 mt-1 truncate">
              <MapPin className="w-3 h-3 text-red-400 shrink-0" />
              <span className="truncate">{camera.location || 'No location set'}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.className}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand?.(camera);
            }}
            className="p-1.5 rounded-lg bg-black/40 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 transition-colors"
            title="Expand feed"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <CameraActionsMenu camera={camera} onError={setActionError} />
        </div>
      </div>

      {/* Bottom bar: latency, detection, action */}
      <div className="relative z-10 p-3 flex items-end justify-between gap-2 text-xs font-mono select-none bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-slate-300" title="Measured: frame decoded on the backend -> sent to this browser">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              Latency: <strong className="text-white">{active && latencyMs != null ? `${Math.round(latencyMs)} ms` : '—'}</strong>
            </span>
            <span className="text-slate-300">
              Detection:{' '}
              <strong className={active ? 'text-emerald-400' : 'text-slate-500'}>{active ? 'ACTIVE' : 'STANDBY'}</strong>
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {det?.resolution || camera.resolution}
            {active && det?.captureFps ? ` · ${Math.round(det.captureFps)} FPS` : ''}
            {active && det?.latency?.detectionMs != null ? ` · YOLO ${Math.round(det.latency.detectionMs)} ms` : ''}
            {det?.progress != null ? ` · ${Math.round(det.progress * 100)}% of video` : ''}
            {det?.accidentIds?.length ? ` · ${det.accidentIds.length} accident(s) saved` : ''}
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleDetection}
          disabled={busy}
          className={`px-2.5 py-1.5 rounded-lg text-white text-[10px] font-bold flex items-center gap-1 border shadow-sm cursor-pointer disabled:opacity-60 shrink-0 ${
            active ? 'bg-slate-700/90 hover:bg-slate-600 border-slate-500/50' : 'bg-red-600/90 hover:bg-red-600 border-red-400/40'
          }`}
          title={active ? 'Stop accident detection' : 'Connect and start YOLO11 accident detection'}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : active ? <Square className="w-3 h-3 fill-white" /> : <Play className="w-3 h-3 fill-white" />}
          <span>{busy ? (active ? 'STOPPING' : 'CONNECTING') : active ? 'STOP' : 'START'}</span>
        </button>
      </div>
    </div>
  );
};

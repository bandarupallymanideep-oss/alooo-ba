import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Trash2,
  Radio,
  Upload,
  Play,
  Square,
  AlertTriangle,
  Loader2,
  Camera as CameraIcon,
  Gauge
} from 'lucide-react';
import type { Camera, ConnectionTestResult } from '../api/types';
import { testConnection } from '../api/cameras';
import { useCameras } from '../context/CameraContext';
import { useAlerts } from '../context/AlertsContext';
import { getDetectionBadge } from '../utils/detectionStatus';
import { CameraActionsMenu } from './CameraActionsMenu';
import { ConfirmDialog } from './ConfirmDialog';

interface CameraCardProps {
  camera: Camera;
  onEdit: (camera: Camera) => void;
}

export const CameraCard: React.FC<CameraCardProps> = ({ camera, onEdit }) => {
  const navigate = useNavigate();
  const { startDetection, stopDetection, removeCamera } = useCameras();
  const { alerts } = useAlerts();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ConnectionTestResult | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const det = camera.detection;
  const active = !!det?.active;
  const badge = getDetectionBadge(det);
  const alertCount = alerts.filter(a => a.cameraId === camera.id).length;
  const newAlertCount = alerts.filter(a => a.cameraId === camera.id && a.status === 'New').length;
  const online = active || camera.status === 'Connected';

  const showError = (text: string) => setMessage({ success: false, status: 'error', code: 'ERROR', message: text });

  const handleStartStop = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (active) {
        await stopDetection(camera.id);
      } else {
        await startDetection(camera.id);
        navigate(`/live?camera=${encodeURIComponent(camera.id)}`); // same tab, focused feed
      }
    } catch (err: any) {
      showError(err?.message || 'Unable to start detection.');
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setMessage(null);
    setMessage(await testConnection({ cameraId: camera.id }));
    setThumbFailed(false);
    setBusy(false);
  };

  const errorText = det && ['error', 'disconnected', 'reconnecting'].includes(det.state) ? det.error?.message || det.message : null;

  return (
    <div className="group rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 card-elevate overflow-hidden flex flex-col justify-between">
      <div>
        <div className="relative aspect-video bg-black overflow-hidden select-none force-dark">
          {camera.thumbnailUrl && !thumbFailed ? (
            <img
              src={camera.thumbnailUrl}
              alt={camera.name}
              onError={() => setThumbFailed(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-600">
              <CameraIcon className="w-9 h-9 mb-2" />
              <span className="text-[10px] font-mono uppercase tracking-widest">No preview yet</span>
              <span className="text-[10px] font-mono text-slate-500 mt-0.5">Test the connection or press Start</span>
            </div>
          )}

          <div className="absolute inset-0 scanlines opacity-30 pointer-events-none" />

          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between text-[11px] font-mono z-10">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border font-semibold ${badge.className}`}>
              <span className={`w-2 h-2 rounded-full ${active ? 'bg-red-500 live-dot' : badge.dot}`} />
              <span>{active && det?.state !== 'accident' ? `LIVE · ${badge.label}` : badge.label}</span>
            </div>
            <CameraActionsMenu camera={camera} onEdit={onEdit} onTest={handleTest} openLiveOnStart onError={showError} />
          </div>

          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-[10px] font-mono">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-slate-300 backdrop-blur-sm">
              {camera.sourceType === 'rtsp' ? (
                <><Radio className="w-3 h-3 text-red-400" /><span>RTSP STREAM</span></>
              ) : (
                <><Upload className="w-3 h-3 text-amber-400" /><span>VIDEO FILE</span></>
              )}
            </div>
            {active && det?.latency?.deliveryMs != null && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-slate-300">
                <Gauge className="w-3 h-3 text-cyan-400" />
                {Math.round(det.latency.deliveryMs)} ms
              </div>
            )}
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white group-hover:text-red-400 transition-colors truncate">{camera.name}</h3>
              <div className="flex items-center gap-1 text-xs text-slate-400 mt-1 truncate">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{camera.location}</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-1 truncate" title={camera.sourceUrl}>
                {camera.sourceType === 'rtsp' ? camera.sourceUrl : camera.fileName || camera.sourceUrl}
              </div>
            </div>
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border shrink-0 ${
                online ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-500'}`} />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>

          {(message || errorText) && (
            <div
              className={`mt-3 p-2 rounded-lg border text-[11px] font-mono leading-snug ${
                message?.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              {message
                ? message.success
                  ? `${message.message} (${message.resolution}${message.fps ? ` @ ${message.fps} FPS` : ''})`
                  : message.message
                : errorText}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-xs font-mono text-slate-400">
            <div>
              <span className="text-slate-500 text-[10px] block">RESOLUTION</span>
              <span className="text-slate-300 font-semibold">{camera.resolution}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">DETECTION</span>
              <span className={active ? 'text-amber-400 font-bold' : 'text-slate-500'}>{active ? 'ACTIVE' : 'STANDBY'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">ALERTS</span>
              <span className={newAlertCount ? 'text-red-400 font-bold' : 'text-slate-300'}>
                {alertCount}{newAlertCount ? ` (${newAlertCount} new)` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Camera actions: Start / Alerts & Violations / Delete Camera */}
      <div className="px-4 py-3 border-t border-slate-800/60 bg-slate-950/40 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleStartStop}
          disabled={busy}
          className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-60 ${
            active ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/20'
          }`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : active ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {active ? 'Stop' : 'Start'}
        </button>
        <button
          type="button"
          onClick={() => navigate(`/alerts?camera=${encodeURIComponent(camera.id)}`)}
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer transition-colors"
          title="Alerts & Violations for this camera"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span className="truncate">Alerts</span>
          {alertCount > 0 && <span className="text-[10px] text-red-400">{alertCount}</span>}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 cursor-pointer transition-colors"
          title="Delete Camera"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="truncate">Delete</span>
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete camera?"
        message={
          <>
            <strong className="text-white">{camera.name}</strong> will be removed and its detection stopped.
            Saved accident footage from this camera is kept in Alerts & Violations.
          </>
        }
        confirmLabel="Delete Camera"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await removeCamera(camera.id);
          setConfirmDelete(false);
        }}
      />
    </div>
  );
};

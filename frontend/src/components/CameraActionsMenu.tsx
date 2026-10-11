import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  MoreVertical,
  Play,
  Square,
  AlertTriangle,
  Trash2,
  Wifi,
  Edit3,
  MonitorPlay,
  Loader2
} from 'lucide-react';
import type { Camera } from '../api/types';
import { useCameras } from '../context/CameraContext';
import { useAlerts } from '../context/AlertsContext';
import { ConfirmDialog } from './ConfirmDialog';

interface CameraActionsMenuProps {
  camera: Camera;
  onEdit?: (camera: Camera) => void;
  onTest?: (camera: Camera) => void;
  /** open the camera in the Live Monitor after Start (used on the Dashboard) */
  openLiveOnStart?: boolean;
  onError?: (message: string) => void;
  className?: string;
}

/**
 * Camera action menu: Start / Stop, Alerts & Violations, Delete Camera (+ Live view, Test, Edit).
 * All navigation stays in the same tab (React Router).
 */
export const CameraActionsMenu: React.FC<CameraActionsMenuProps> = ({
  camera,
  onEdit,
  onTest,
  openLiveOnStart = false,
  onError,
  className = ''
}) => {
  const navigate = useNavigate();
  const { startDetection, stopDetection, removeCamera } = useCameras();
  const { alerts } = useAlerts();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  };

  const toggle = () => {
    place();
    setOpen(o => !o);
  };

  const active = !!camera.detection?.active;
  const alertCount = alerts.filter(a => a.cameraId === camera.id).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // keep the menu attached to its button when the page scrolls or re-lays out
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const run = async (fn: () => Promise<unknown>) => {
    setOpen(false);
    setBusy(true);
    try {
      await fn();
    } catch (err: any) {
      onError?.(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const item = 'w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left text-slate-200 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors';

  return (
    <div ref={ref} className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${camera.name}`}
        title="Camera actions"
        className="p-1.5 rounded-lg bg-black/40 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: pos.top, right: pos.right }}
          onClick={(e) => e.stopPropagation()}
          className="fixed w-56 z-[55] p-1.5 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl animate-menu-in"
        >
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() =>
              run(async () => {
                if (active) {
                  await stopDetection(camera.id);
                } else {
                  await startDetection(camera.id);
                  if (openLiveOnStart) navigate(`/live?camera=${encodeURIComponent(camera.id)}`);
                }
              })
            }
          >
            {active ? <Square className="w-3.5 h-3.5 text-slate-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{active ? 'Stop detection' : 'Start'}</span>
          </button>
          <button role="menuitem" type="button" className={item}
            onClick={() => { setOpen(false); navigate(`/live?camera=${encodeURIComponent(camera.id)}`); }}>
            <MonitorPlay className="w-3.5 h-3.5 text-cyan-400" />
            <span>Open in Live Monitor</span>
          </button>
          <button role="menuitem" type="button" className={item}
            onClick={() => { setOpen(false); navigate(`/alerts?camera=${encodeURIComponent(camera.id)}`); }}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="flex-1">Alerts & Violations</span>
            {alertCount > 0 && <span className="text-[10px] font-mono px-1.5 rounded bg-red-500/15 text-red-400">{alertCount}</span>}
          </button>
          {onTest && (
            <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onTest(camera); }}>
              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              <span>Test connection</span>
            </button>
          )}
          {onEdit && (
            <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onEdit(camera); }}>
              <Edit3 className="w-3.5 h-3.5 text-slate-400" />
              <span>Edit camera</span>
            </button>
          )}
          <div className="my-1 border-t border-slate-800" />
          <button role="menuitem" type="button"
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
            onClick={() => { setOpen(false); setConfirmDelete(true); }}>
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Camera</span>
          </button>
        </div>,
        document.body
      )}

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

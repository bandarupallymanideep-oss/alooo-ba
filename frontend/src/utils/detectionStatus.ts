import type { DetectionState, DetectionStatus } from '../api/types';

export interface DetectionBadge {
  label: string;
  className: string;
  dot: string;
}

const BADGES: Record<DetectionState | 'idle', DetectionBadge> = {
  connecting: { label: 'CONNECTING', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40', dot: 'bg-amber-400 animate-pulse' },
  connected: { label: 'CONNECTED', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-400' },
  detecting: { label: 'DETECTING', className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40', dot: 'bg-cyan-400 animate-pulse' },
  accident: { label: 'ACCIDENT DETECTED', className: 'bg-red-600/90 text-white border-red-400 animate-pulse', dot: 'bg-white animate-ping' },
  reconnecting: { label: 'RECONNECTING', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40', dot: 'bg-amber-400 animate-ping' },
  disconnected: { label: 'DISCONNECTED', className: 'bg-slate-800 text-slate-300 border-slate-600', dot: 'bg-slate-400' },
  error: { label: 'ERROR', className: 'bg-red-500/15 text-red-300 border-red-500/40', dot: 'bg-red-500' },
  completed: { label: 'COMPLETED', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-500' },
  stopped: { label: 'STOPPED', className: 'bg-slate-800 text-slate-300 border-slate-600', dot: 'bg-slate-500' },
  idle: { label: 'IDLE', className: 'bg-slate-800 text-slate-400 border-slate-700', dot: 'bg-slate-500' },
};

export function getDetectionBadge(detection?: DetectionStatus | null): DetectionBadge {
  return BADGES[detection?.state ?? 'idle'] ?? BADGES.idle;
}

export function isDetectionActive(detection?: DetectionStatus | null): boolean {
  return !!detection?.active;
}

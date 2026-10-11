import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, ShieldAlert } from 'lucide-react';
import type { AccidentRecord } from '../api/types';

interface ToastProps {
  alert: AccidentRecord | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ alert, onDismiss }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!alert) return;
    // Auto dismiss after 10 seconds if not interacted with
    const timer = setTimeout(() => {
      onDismiss();
    }, 10000);
    return () => clearTimeout(timer);
  }, [alert, onDismiss]);

  if (!alert) return null;

  return (
    <div className="fixed top-5 right-5 z-50 max-w-md w-full animate-bounce-short">
      <div className="bg-slate-900/95 border-2 border-red-500 shadow-2xl shadow-red-500/30 rounded-xl p-4 backdrop-blur-md relative overflow-hidden">
        {/* Glowing top line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-pulse" />

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center justify-center shrink-0 text-red-400 animate-pulse">
            <ShieldAlert className="w-6 h-6" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-red-500 text-white uppercase tracking-wider animate-pulse">
                ACCIDENT DETECTED
              </span>
              <span className="text-xs font-mono text-slate-400">{alert.id} • {alert.severity}</span>
            </div>

            <h4 className="mt-1 text-sm font-semibold text-white truncate">
              {alert.categoryLabel || alert.collisionType}
            </h4>

            <p className="text-xs text-slate-300 mt-0.5 truncate">
              <strong className="text-red-300">{alert.cameraName}</strong> • {alert.location}
            </p>

            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="font-mono text-amber-400">
                Confidence: <strong>{alert.confidenceScore.toFixed(1)}%</strong>
              </span>
              <span className="text-slate-400 font-mono">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onDismiss();
                  navigate(`/alerts/${alert.id}`);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors shadow-lg shadow-red-600/30 cursor-pointer"
              >
                <span>Inspect Evidence</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onDismiss();
                  navigate('/live');
                }}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-700 cursor-pointer"
              >
                View Live Feed
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

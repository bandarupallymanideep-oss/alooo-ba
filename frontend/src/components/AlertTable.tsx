import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle, 
  Clock, 
  MapPin, 
  Camera as CameraIcon, 
  Eye,
  Trash2,
  ShieldAlert
} from 'lucide-react';
import type { AccidentRecord, AccidentStatus } from '../api/types';

interface AlertTableProps {
  alerts: AccidentRecord[];
  onMarkAcknowledged: (id: string) => void;
  onMarkResolved: (id: string) => void;
  onDelete?: (alert: AccidentRecord) => void;
  onRowClick?: (alert: AccidentRecord) => void;
}

export const AlertTable: React.FC<AlertTableProps> = ({
  alerts,
  onMarkAcknowledged,
  onMarkResolved,
  onDelete,
  onRowClick
}) => {
  const navigate = useNavigate();

  const getStatusBadge = (status: AccidentStatus) => {
    switch (status) {
      case 'New':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-red-500/15 text-red-400 border border-red-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block" />
            NEW
          </span>
        );
      case 'Acknowledged':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            ACKNOWLEDGED
          </span>
        );
      case 'Resolved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-3 h-3" />
            RESOLVED
          </span>
        );
    }
  };

  const getSeverityPill = (severity: string) => {
    switch (severity) {
      case 'Critical':
        return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-600 text-white font-bold">CRITICAL</span>;
      case 'High':
        return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">HIGH</span>;
      case 'Moderate':
        return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">MODERATE</span>;
      default:
        return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">MINOR</span>;
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-12 text-center">
        <ShieldAlert className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h4 className="text-sm font-semibold text-slate-200">No Incidents Found</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          No accident records match your current filter parameters or search query.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden card-shadow backdrop-blur-md">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-mono text-slate-400 uppercase tracking-wider select-none">
              <th className="py-3.5 px-4 font-semibold">Accident ID</th>
              <th className="py-3.5 px-4 font-semibold">Camera Source</th>
              <th className="py-3.5 px-4 font-semibold">Location</th>
              <th className="py-3.5 px-4 font-semibold">Time & Date</th>
              <th className="py-3.5 px-4 font-semibold">AI Confidence</th>
              <th className="py-3.5 px-4 font-semibold">Status</th>
              <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {alerts.map((record) => {
              const dateObj = new Date(record.timestamp);
              const formattedTime = dateObj.toLocaleTimeString('en-US', { hour12: false });
              const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

              return (
                <tr
                  key={record.id}
                  onClick={() => onRowClick ? onRowClick(record) : navigate(`/alerts/${record.id}`)}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer group animate-page-in"
                >
                  {/* Accident ID + Severity */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white group-hover:text-red-400 transition-colors">
                        {record.id}
                      </span>
                      {getSeverityPill(record.severity)}
                      {record.recording && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-600/80 text-white animate-pulse">REC</span>
                      )}
                    </div>
                    <div className="mt-1">
                      <span className="inline-block text-[10px] font-mono font-semibold tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                        {record.categoryLabel || record.collisionType}
                      </span>
                    </div>
                  </td>

                  {/* Camera */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-400">
                        <CameraIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-slate-200">
                        {record.cameraName}
                      </span>
                    </div>
                  </td>

                  {/* Location */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 text-slate-300 max-w-xs truncate">
                      <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="truncate">{record.location}</span>
                    </div>
                  </td>

                  {/* Time */}
                  <td className="py-3.5 px-4 whitespace-nowrap font-mono text-slate-300">
                    <div className="text-white font-medium">{formattedTime}</div>
                    <div className="text-[10px] text-slate-500">{formattedDate}</div>
                  </td>

                  {/* Confidence */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.min(record.confidenceScore, 100)}%` }}
                          className={`h-full rounded-full ${
                            record.confidenceScore > 90
                              ? 'bg-red-500'
                              : record.confidenceScore > 80
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                      </div>
                      <span className="font-mono font-bold text-slate-200">
                        {record.confidenceScore.toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {getStatusBadge(record.status)}
                  </td>

                  {/* Action buttons */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {record.status === 'New' && (
                        <button
                          type="button"
                          onClick={() => onMarkAcknowledged(record.id)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-medium transition-colors cursor-pointer"
                          title="Acknowledge alert"
                        >
                          Acknowledge
                        </button>
                      )}

                      {record.status !== 'Resolved' && (
                        <button
                          type="button"
                          onClick={() => onMarkResolved(record.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-medium transition-colors cursor-pointer"
                          title="Mark resolved"
                        >
                          Resolve
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => navigate(`/alerts/${record.id}`)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-mono transition-colors cursor-pointer"
                        title="View accident evidence"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(record)}
                          disabled={record.recording}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-mono transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title={record.recording ? 'Clip still recording — delete after it is saved' : 'Delete alert'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCheck, Download } from 'lucide-react';
import { useAlerts } from '../context/AlertsContext';
import { useCameras } from '../context/CameraContext';
import { AlertFilterBar } from '../components/AlertFilterBar';
import { AlertTable } from '../components/AlertTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { filterAlerts } from '../api/alerts';
import type { AccidentRecord, AlertFilterOptions } from '../api/types';

export const Alerts: React.FC = () => {
  const { alerts, markAcknowledged, markResolved, newAlertsCount, removeAlert, categories, isLoading } = useAlerts();
  const { cameras } = useCameras();
  const [searchParams, setSearchParams] = useSearchParams();

  // camera + category live in the URL (e.g. /alerts?camera=cam-3&category=car-car) so the
  // camera "Alerts & Violations" actions link straight to a filtered view in the same tab
  const [otherFilters, setOtherFilters] = useState<AlertFilterOptions>({});
  const filters: AlertFilterOptions = {
    ...otherFilters,
    cameraId: searchParams.get('camera') || undefined,
    category: searchParams.get('category') || undefined,
  };

  const setFilters = (next: AlertFilterOptions) => {
    const { cameraId, category, ...rest } = next;
    setOtherFilters(rest);
    const params: Record<string, string> = {};
    if (cameraId && cameraId !== 'all') params.camera = cameraId;
    if (category && category !== 'all') params.category = category;
    setSearchParams(params, { replace: true });
  };

  const [isExporting, setIsExporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AccidentRecord | null>(null);

  const filteredAlerts = useMemo(
    () => filterAlerts(alerts, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alerts, searchParams, otherFilters]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    alerts.forEach(a => {
      if (a.category) counts[a.category] = (counts[a.category] || 0) + 1;
    });
    return counts;
  }, [alerts]);

  const handleAcknowledgeAll = async () => {
    const unacknowledged = alerts.filter(a => a.status === 'New');
    if (unacknowledged.length === 0) return;
    if (window.confirm(`Mark all ${unacknowledged.length} pending alert(s) as Acknowledged?`)) {
      for (const a of unacknowledged) {
        await markAcknowledged(a.id);
      }
    }
  };

  const handleExportCsv = () => {
    setIsExporting(true);
    try {
      const headers = ['Accident ID', 'Category', 'Camera ID', 'Camera Name', 'Location', 'Timestamp', 'Confidence Score', 'Severity', 'Status', 'Video'];
      const rows = filteredAlerts.map(a => [
        a.id,
        `"${a.categoryLabel || ''}"`,
        a.cameraId,
        `"${a.cameraName}"`,
        `"${a.location}"`,
        a.timestamp,
        a.confidenceScore,
        a.severity,
        a.status,
        a.videoClipUrl
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `sadarakshak_accidents_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setTimeout(() => setIsExporting(false), 500);
    }
  };

  const cameraName = filters.cameraId ? cameras.find(c => c.id === filters.cameraId)?.name || filters.cameraId : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-black text-white tracking-tight font-sans">Alerts & Violations</h2>
            {newAlertsCount > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-red-600 text-white shadow-lg shadow-red-600/30 animate-pulse">
                {newAlertsCount} ACTION REQUIRED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {cameraName
              ? <>Accidents detected on <strong className="text-slate-200">{cameraName}</strong> — clear the camera filter to see all cameras</>
              : 'Accidents detected by YOLO11 with the automatically saved evidence footage'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {newAlertsCount > 0 && (
            <button
              type="button"
              onClick={handleAcknowledgeAll}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-semibold transition-colors cursor-pointer"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Acknowledge All ({newAlertsCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || filteredAlerts.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-mono transition-colors cursor-pointer disabled:opacity-50"
            title="Export filtered records to CSV"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <AlertFilterBar
        filters={filters}
        onChange={setFilters}
        cameras={cameras}
        categories={categories}
        categoryCounts={categoryCounts}
        availableLocations={Array.from(new Set(alerts.map(a => a.location)))}
        totalRecordsCount={alerts.length}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="h-14 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <AlertTable
          alerts={filteredAlerts}
          onMarkAcknowledged={(id) => markAcknowledged(id)}
          onMarkResolved={(id) => markResolved(id)}
          onDelete={(record) => setPendingDelete(record)}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete Accident Alert?"
        message={
          pendingDelete && (
            <>
              <strong className="text-white">{pendingDelete.id}</strong> ({pendingDelete.categoryLabel || pendingDelete.collisionType})
              from <strong className="text-white">{pendingDelete.cameraName}</strong> will be removed from Alerts & Violations.
              Its video is moved to <code className="text-xs">detected_accidents/deleted/</code> on the server.
            </>
          )
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await removeAlert(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
};

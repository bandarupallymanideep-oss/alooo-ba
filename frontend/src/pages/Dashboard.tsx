import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Camera as CameraIcon,
  Wifi,
  AlertTriangle,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  ArrowRight,
  Video,
  Clock
} from 'lucide-react';
import { useCameras } from '../context/CameraContext';
import { useAlerts } from '../context/AlertsContext';
import { StatCard } from '../components/StatCard';
import { CameraCard } from '../components/CameraCard';
import { CameraModal } from '../components/CameraModal';
import { VideoTile } from '../components/VideoTile';
import type { Camera, CameraInput } from '../api/types';
import { BACKEND_URL } from '../api/client';

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { cameras, isLoading: camerasLoading, addCamera, editCamera, refreshCameras, backendOnline, error: camerasError, health } = useCameras();
  const { stats, alerts, flashingCameraIds, isLoading: alertsLoading } = useAlerts();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCameraForEdit, setSelectedCameraForEdit] = useState<Camera | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const handleOpenAddModal = () => {
    setSelectedCameraForEdit(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (camera: Camera) => {
    setSelectedCameraForEdit(camera);
    setModalOpen(true);
  };

  const handleSaveCamera = async (data: CameraInput) => {
    if (selectedCameraForEdit) {
      return editCamera(selectedCameraForEdit.id, data);
    }
    return addCamera(data);
  };

  const isOnline = (c: Camera) => !!c.detection?.active || c.status === 'Connected';

  const filteredCameras = cameras.filter(cam => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = cam.name.toLowerCase().includes(q) || cam.location.toLowerCase().includes(q) || cam.id.toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'online' && isOnline(cam)) ||
      (statusFilter === 'detecting' && cam.detection?.active) ||
      (statusFilter === 'offline' && !isOnline(cam));
    return matchesSearch && matchesStatus;
  });

  const totalCameras = cameras.length;
  const onlineCameras = cameras.filter(isOnline).length;
  const detectingCameras = cameras.filter(c => c.detection?.active).length;
  const activeAlerts = alerts.filter(a => a.status === 'New').length;
  const accidentsTotal = alerts.length;
  const accidentsToday = stats?.accidentsDetectedToday ?? 0;

  // live preview: detecting cameras first, then the rest (max 4)
  const liveCameras = [...cameras].sort((a, b) => Number(!!b.detection?.active) - Number(!!a.detection?.active)).slice(0, 4);
  const recentAlerts = alerts.slice(0, 6);

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono tracking-[0.25em] text-red-400 uppercase">SADARAKSHAK Control Room</div>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">Operations Overview</h2>
          <p className="text-xs text-slate-400 mt-1">
            Live CCTV / RTSP cameras, YOLO11 accident detection and saved accident evidence
            {health ? ` · inference on ${health.model.device.toUpperCase()} (${health.model.engine})` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refreshCameras()}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-red-600/25 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Camera</span>
          </button>
        </div>
      </div>

      {backendOnline === false && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/40 text-red-400 text-xs font-mono">
          <strong>Backend offline.</strong> {camerasError || `Cannot reach ${BACKEND_URL}.`} Start it with:
          <code className="block mt-1">cd backend &amp;&amp; {'venv\\Scripts\\activate'} &amp;&amp; python -m uvicorn app:app --host 0.0.0.0 --port 8000</code>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Cameras"
          value={totalCameras}
          icon={CameraIcon}
          change={`${cameras.filter(c => c.sourceType === 'rtsp').length} RTSP · ${cameras.filter(c => c.sourceType === 'upload').length} video`}
          variant="slate"
          subtitle="Registered sources"
        />
        <StatCard
          title="Online"
          value={onlineCameras}
          icon={Wifi}
          change={`${detectingCameras} detecting`}
          trend="up"
          variant="emerald"
          subtitle="Reachable or streaming now"
        />
        <StatCard
          title="Active Alerts"
          value={activeAlerts}
          icon={ShieldAlert}
          change={activeAlerts > 0 ? 'action required' : 'all clear'}
          trend={activeAlerts > 0 ? 'alert' : 'neutral'}
          variant={activeAlerts > 0 ? 'red' : 'cyan'}
          subtitle="New, not yet acknowledged"
        />
        <StatCard
          title="Accidents Detected"
          value={accidentsTotal}
          icon={AlertTriangle}
          change={`${accidentsToday} today`}
          trend="alert"
          variant="amber"
          subtitle="Saved accident evidence"
        />
      </div>

      {/* Live monitoring + recent alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white uppercase tracking-wider font-mono">
              <Video className="w-4 h-4 text-red-400" /> Live Monitoring
              <span className="text-[10px] font-normal text-slate-500 normal-case tracking-normal">
                {detectingCameras} of {totalCameras} detecting
              </span>
            </h3>
            <button
              type="button"
              onClick={() => navigate('/live')}
              className="flex items-center gap-1 text-xs font-mono text-slate-300 hover:text-white cursor-pointer"
            >
              Open Live Monitor <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {camerasLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map(n => <div key={n} className="rounded-2xl bg-slate-900/60 border border-slate-800 aspect-video animate-pulse" />)}
            </div>
          ) : liveCameras.length === 0 ? (
            <div className="rounded-2xl bg-slate-900/50 border border-dashed border-slate-700 p-10 text-center">
              <CameraIcon className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="text-sm text-slate-300 font-semibold">No cameras yet</p>
              <p className="text-xs text-slate-500 mt-1">Add an RTSP camera or a video to start monitoring.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveCameras.map(camera => (
                <VideoTile
                  key={camera.id}
                  camera={camera}
                  compact
                  isFlashing={flashingCameraIds.has(camera.id)}
                  onExpand={(c) => navigate(`/live?camera=${encodeURIComponent(c.id)}`)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white uppercase tracking-wider font-mono">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Recent Alerts
            </h3>
            <button
              type="button"
              onClick={() => navigate('/alerts')}
              className="flex items-center gap-1 text-xs font-mono text-slate-300 hover:text-white cursor-pointer"
            >
              Alerts & Violations <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 card-shadow divide-y divide-slate-800/70 overflow-hidden">
            {alertsLoading ? (
              [1, 2, 3].map(n => <div key={n} className="h-16 m-3 rounded-xl bg-slate-800/60 animate-pulse" />)
            ) : recentAlerts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No accidents detected yet.</div>
            ) : (
              recentAlerts.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigate(`/alerts/${a.id}`)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-800/40 transition-colors cursor-pointer animate-page-in"
                >
                  <div className="force-dark w-20 h-12 rounded-lg overflow-hidden bg-black shrink-0 border border-slate-800">
                    {a.snapshotImage && <img src={a.snapshotImage} alt={a.id} className="w-full h-full object-cover" loading="lazy" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-white">{a.id}</span>
                      {a.status === 'New' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 live-dot" />}
                      {a.recording && <span className="text-[9px] font-mono px-1 rounded bg-red-600 text-white">REC</span>}
                    </div>
                    <div className="text-[10px] font-mono text-slate-300 truncate">{a.categoryLabel || a.collisionType}</div>
                    <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {timeAgo(a.timestamp)} · {a.cameraName}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-amber-400 shrink-0">{a.confidenceScore.toFixed(0)}%</span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Camera management */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono shrink-0">
            Camera Management ({filteredCameras.length})
          </h3>
          <div className="flex flex-1 sm:justify-end items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cameras by name, location, ID..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-red-500 rounded-xl text-xs text-white placeholder-slate-500 outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <Filter className="w-3.5 h-3.5 text-slate-500 hidden sm:inline" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none cursor-pointer"
              >
                <option value="all">All ({totalCameras})</option>
                <option value="online">Online ({onlineCameras})</option>
                <option value="detecting">Detecting ({detectingCameras})</option>
                <option value="offline">Offline ({totalCameras - onlineCameras})</option>
              </select>
            </div>
          </div>
        </div>

        {camerasLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map(n => (
              <div key={n} className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 aspect-video animate-pulse" />
            ))}
          </div>
        ) : filteredCameras.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-12 text-center">
            <CameraIcon className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <h4 className="text-sm font-semibold text-slate-200">No Cameras Found</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'No cameras match your search and filter.'
                : 'Add your first CCTV / IP camera (RTSP) or an accident video.'}
            </p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Camera</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredCameras.map((camera) => (
              <CameraCard key={camera.id} camera={camera} onEdit={handleOpenEditModal} />
            ))}
          </div>
        )}
      </section>

      <CameraModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveCamera}
        cameraToEdit={selectedCameraForEdit}
        totalCamerasCount={cameras.length}
      />
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  ShieldAlert, 
  CheckCircle, 
  Download, 
  Film, 
  Camera as CameraIcon, 
  FileText, 
  Activity, 
  Send,
  Loader2,
  Trash2,
  Gauge
} from 'lucide-react';
import { useAlerts } from '../context/AlertsContext';
import { LeafletMap } from '../components/LeafletMap';
import { ConfirmDialog } from '../components/ConfirmDialog';

/** Review speeds for saved accident footage; 0.25x is the default for detailed accident review. */
const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2];
const DEFAULT_REVIEW_RATE = 0.25;

export const AlertDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { alerts, markAcknowledged, markResolved, saveNotes, removeAlert, isLoading } = useAlerts();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(DEFAULT_REVIEW_RATE);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [activeTab, setActiveTab] = useState<'snapshot' | 'video'>('video');
  const [notes, setNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Find accident record by id
  const record = alerts.find(a => a.id.toLowerCase() === id?.toLowerCase());

  const [notesSaved, setNotesSaved] = useState(false);

  useEffect(() => {
    if (record?.notes) {
      setNotes(record.notes);
    }
  }, [record?.id]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, activeTab, record?.videoClipUrl]);

  if (!record && isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="h-10 w-72 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 aspect-video rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
          <div className="lg:col-span-5 h-80 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-12 text-center max-w-xl mx-auto mt-12">
        <ShieldAlert className="w-12 h-12 mx-auto text-red-500 mb-3" />
        <h3 className="text-base font-bold text-white">Incident Record Not Found</h3>
        <p className="text-xs text-slate-400 mt-1 mb-6">
          The requested accident record <strong className="text-red-400">"{id}"</strong> does not exist in the active database.
        </p>
        <button
          type="button"
          onClick={() => navigate('/alerts')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-mono transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Alerts List</span>
        </button>
      </div>
    );
  }

  const handleAcknowledge = async () => {
    setIsUpdating(true);
    try {
      await markAcknowledged(record.id, notes);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResolve = async () => {
    setIsUpdating(true);
    try {
      await markResolved(record.id, notes);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveNotes = async () => {
    setIsUpdating(true);
    try {
      await saveNotes(record.id, notes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } finally {
      setIsUpdating(false);
    }
  };

  const hasCoords = record.latitude != null && record.longitude != null;

  const handleDownloadEvidence = () => {
    setDownloadSuccess(true);
    // Generate evidence bundle JSON
    const evidencePackage = {
      incidentId: record.id,
      generatedAt: new Date().toISOString(),
      detectionSystem: 'SADARAKSHAK - Real-Time Road Accident Detection',
      neuralEngine: record.model || 'YOLO11m (model/best.pt)',
      evidenceFiles: {
        video: record.videoClipUrl,
        snapshot: record.snapshotImage
      },
      metadata: {
        cameraId: record.cameraId,
        cameraName: record.cameraName,
        location: record.location,
        coordinates: hasCoords ? { latitude: record.latitude, longitude: record.longitude } : 'Not configured',
        detectedTimestamp: record.timestamp,
        confidenceScore: `${record.confidenceScore}%`,
        severity: record.severity,
        vehiclesInvolved: record.vehiclesInvolved,
        collisionType: record.collisionType,
        yoloClass: record.accidentType,
        clipDurationSeconds: record.durationSeconds,
        videoOffsetSeconds: record.videoOffsetSeconds,
        source: record.source
      },
      auditLog: {
        status: record.status,
        acknowledgedAt: record.acknowledgedAt || 'N/A',
        acknowledgedBy: record.acknowledgedBy || 'N/A',
        resolvedAt: record.resolvedAt || 'N/A',
        resolvedBy: record.resolvedBy || 'N/A',
        operatorNotes: notes || record.notes || 'None'
      }
    };

    const blob = new Blob([JSON.stringify(evidencePackage, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EVIDENCE_${record.id}_FORENSIC_REPORT.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const handleDownloadVideo = async () => {
    // download in-app (no new tab): fetch the clip from the backend and save it
    setDownloading(true);
    try {
      const res = await fetch(record.videoClipUrl);
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = record.clipFile || `${record.id}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const dateObj = new Date(record.timestamp);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Top Nav Breadcrumbs & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/alerts')}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Back to alerts"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white font-mono tracking-tight">
                INCIDENT FILE: {record.id.toUpperCase()}
              </h2>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  record.status === 'New'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : record.status === 'Acknowledged'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {record.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                {record.categoryLabel || record.collisionType}
              </span>
              <span>{record.cameraName} • {record.location}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons: Acknowledge, Resolve, Download Evidence */}
        <div className="flex flex-wrap items-center gap-2">
          {record.status === 'New' && (
            <button
              type="button"
              onClick={handleAcknowledge}
              disabled={isUpdating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/40 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Mark Acknowledged</span>
            </button>
          )}

          {record.status !== 'Resolved' && (
            <button
              type="button"
              onClick={handleResolve}
              disabled={isUpdating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Mark Resolved</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadEvidence}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-mono font-bold shadow-md shadow-red-600/30 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloadSuccess ? 'Evidence Downloaded!' : 'Download Evidence'}</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={record.recording}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-mono font-bold transition-all cursor-pointer disabled:opacity-40"
            title={record.recording ? 'Clip still recording' : 'Delete this alert'}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left side Media (Snapshot/Video Clip), Right side Map & Forensics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Snapshot & Short Video Clip Player */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
            {/* Tab selector between Snapshot and Video Clip */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('snapshot')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    activeTab === 'snapshot'
                      ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                      : 'text-slate-400 hover:text-white bg-slate-900'
                  }`}
                >
                  <CameraIcon className="w-3.5 h-3.5" />
                  <span>AI Incident Snapshot</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('video')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    activeTab === 'video'
                      ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                      : 'text-slate-400 hover:text-white bg-slate-900'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Accident Video</span>
                </button>
              </div>

              <div className="text-[11px] font-mono text-amber-400 font-bold">
                CONFIDENCE: {record.confidenceScore.toFixed(1)}%
              </div>
            </div>

            {/* Media Canvas Viewport */}
            <div className="force-dark relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {activeTab === 'snapshot' ? (
                <div className="w-full h-full relative group">
                  <img
                    src={record.snapshotImage}
                    alt={`Accident ${record.id}`}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 scanlines opacity-30 pointer-events-none" />
                </div>
              ) : (
                <div className="w-full h-full relative flex items-center justify-center">
                  {record.recording ? (
                    <div className="text-center font-mono text-xs text-amber-300">
                      <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                      Accident footage is still being recorded ({record.clipFile})...
                      <div className="text-slate-400 mt-1">The video appears here automatically when the clip is saved.</div>
                    </div>
                  ) : (
                    <video
                      ref={videoRef}
                      key={record.videoClipUrl}
                      src={record.videoClipUrl}
                      controls
                      autoPlay
                      muted
                      loop
                      playsInline
                      onLoadedMetadata={(e) => { e.currentTarget.playbackRate = playbackRate; }}
                      onRateChange={(e) => setPlaybackRate(e.currentTarget.playbackRate)}
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Accident review speed (0.25x default) */}
            {activeTab === 'video' && !record.recording && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-800 bg-slate-950/60">
                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  REVIEW SPEED
                </div>
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800" role="group" aria-label="Playback speed">
                  {PLAYBACK_RATES.map(rate => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setPlaybackRate(rate)}
                      aria-pressed={playbackRate === rate}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                        playbackRate === rate ? 'bg-red-600 text-white shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Snapshot / Clip description */}
            <div className="p-4 bg-slate-950/60 border-t border-slate-800 text-xs font-mono flex items-center justify-between text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                <span>Captured by {record.cameraName}</span>
                {record.clipFile && !record.recording && (
                  <button
                    type="button"
                    onClick={handleDownloadVideo}
                    disabled={downloading}
                    className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 ml-2 cursor-pointer disabled:opacity-50"
                    title="Download the accident video"
                  >
                    {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    {record.clipFile}
                  </button>
                )}
              </div>
              <div>
                {dateObj.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Operator Investigation Notes */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3 backdrop-blur-md">
            <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-400" />
              <span>Operator Investigation Log & Notes</span>
            </h3>

            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter dispatcher comments, emergency response dispatch notes, lane obstruction details..."
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-xs text-white placeholder-slate-600 outline-none font-mono resize-none"
            />

            <div className="flex items-center justify-between pt-1 text-xs font-mono">
              <span className="text-[11px] text-slate-400">
                Saved with the accident record on the SADARAKSHAK backend
              </span>

              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={isUpdating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3 h-3 text-red-400" />
                <span>{notesSaved ? 'Notes Saved' : 'Update Incident Notes'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Leaflet Dark Map & Telemetry Metadata */}
        <div className="lg:col-span-5 space-y-4">
          {/* Leaflet Incident Map */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />
                <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider">
                  GEOGRAPHIC INCIDENT PINPOINT
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">LEAFLET GIS</span>
            </div>

            {hasCoords ? (
              <LeafletMap
                latitude={record.latitude as number}
                longitude={record.longitude as number}
                locationName={record.location}
                cameraName={record.cameraName}
                incidentId={record.id}
                className="h-56 w-full rounded-xl overflow-hidden"
              />
            ) : (
              <div className="h-32 w-full rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-center text-[11px] font-mono text-slate-500 px-4">
                No GPS coordinates configured for this camera. Add latitude/longitude in the camera settings to show the map.
              </div>
            )}

            <div className="text-xs font-mono text-slate-400 pt-1 flex items-center justify-between">
              <span>Location:</span>
              <strong className="text-slate-200">{record.location}</strong>
            </div>
          </div>

          {/* AI Forensic Telemetry Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 backdrop-blur-md">
            <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
              <Activity className="w-4 h-4 text-amber-400" />
              <span>FORENSIC TELEMETRY DATA</span>
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400 text-[10px] block">AI CONFIDENCE SCORE</span>
                <span className="text-lg font-bold text-red-400 font-mono">
                  {record.confidenceScore.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Trigger threshold 85%</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400 text-[10px] block">SEVERITY CLASSIFIER</span>
                <span className="text-lg font-bold text-amber-400 font-mono">
                  {record.severity.toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">From class and confidence</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400 text-[10px] block">VEHICLES INVOLVED</span>
                <span className="text-base font-bold text-white font-mono">
                  {record.vehiclesInvolved} Vehicles
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Implied by accident class</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400 text-[10px] block">ACCIDENT CLIP</span>
                <span className="text-base font-bold text-cyan-400 font-mono">
                  {record.recording ? 'Recording...' : `${record.durationSeconds ?? 0}s`}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{record.clipFrames ?? 0} annotated frames</span>
              </div>
            </div>

            {/* Environmental Conditions */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>YOLO11 Class:</span>
                <span className="text-slate-200">{record.accidentType || '-'}</span>
              </div>
              <div className="flex justify-between text-slate-400 gap-4">
                <span className="shrink-0">Source:</span>
                <span className="text-slate-200 truncate">{record.source || '-'}{record.videoOffsetSeconds != null ? ` @ ${record.videoOffsetSeconds}s` : ''}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Surveillance Node:</span>
                <span className="text-slate-200">{record.cameraName} ({record.cameraId})</span>
              </div>
            </div>

            {/* Audit trail */}
            {(record.acknowledgedAt || record.resolvedAt) && (
              <div className="pt-3 border-t border-slate-800/80 space-y-1.5 text-[11px] font-mono">
                {record.acknowledgedAt && (
                  <div className="text-amber-400/90 flex items-center justify-between">
                    <span>Acknowledged by {record.acknowledgedBy}:</span>
                    <span>{new Date(record.acknowledgedAt).toLocaleTimeString()}</span>
                  </div>
                )}
                {record.resolvedAt && (
                  <div className="text-emerald-400/90 flex items-center justify-between">
                    <span>Resolved by {record.resolvedBy}:</span>
                    <span>{new Date(record.resolvedAt).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete Accident Alert?"
        message={
          <>
            <strong className="text-white">{record.id}</strong> will be removed from Alerts & Violations.
            Its video is moved to <code className="text-xs">detected_accidents/deleted/</code> on the server.
          </>
        }
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await removeAlert(record.id);
          setConfirmDelete(false);
          navigate('/alerts', { replace: true });
        }}
      />
    </div>
  );
};

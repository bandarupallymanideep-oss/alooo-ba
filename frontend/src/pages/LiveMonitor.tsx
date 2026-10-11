import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Grid2X2,
  Grid3X3,
  Square,
  Scan,
  X,
  Camera as CameraIcon,
  ArrowUpRight,
  Radio,
  Film,
  Wifi,
  Play,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useCameras } from '../context/CameraContext';
import { useAlerts } from '../context/AlertsContext';
import { VideoTile } from '../components/VideoTile';
import type { ConnectionTestResult, SampleClip } from '../api/types';
import { detectionSnapshotUrl, detectionStreamUrl, getSampleClips, testConnection, uploadVideo } from '../api/cameras';
import { getDetectionBadge } from '../utils/detectionStatus';

type Notice = { kind: 'ok' | 'error'; text: string; code?: string } | null;

/** Quick connect: RTSP URL -> Test Connection -> Start Detection, or upload / pick a video. */
const QuickConnect: React.FC<{ onStarted: (cameraId: string) => void }> = ({ onStarted }) => {
  const { cameras, addCamera } = useCameras();
  const [mode, setMode] = useState<'rtsp' | 'video'>('rtsp');
  const [rtspUrl, setRtspUrl] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<'test' | 'start' | null>(null);
  const [clips, setClips] = useState<SampleClip[]>([]);
  const [clip, setClip] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getSampleClips().then(c => { setClips(c); if (c[0]) setClip(c[0].url); }).catch(() => setClips([]));
  }, []);

  const validUrl = (u: string) => /^(rtsps?|https?|rtmp):\/\/.+/i.test(u.trim());

  const handleTest = async () => {
    setNotice(null);
    setTestResult(null);
    if (!rtspUrl.trim()) return setNotice({ kind: 'error', text: 'Enter an RTSP URL, e.g. rtsp://192.168.1.100:554/stream' });
    setBusy('test');
    setTestResult(await testConnection({ rtspUrl: rtspUrl.trim() }));
    setBusy(null);
  };

  const start = async () => {
    setNotice(null);
    const n = cameras.length + 1;
    try {
      setBusy('start');
      let sourceUrl: string;
      let fileName: string | null = null;
      if (mode === 'rtsp') {
        if (!validUrl(rtspUrl)) {
          setNotice({ kind: 'error', text: 'Invalid RTSP URL: it must start with rtsp:// (e.g. rtsp://192.168.1.100:554/stream).' });
          return;
        }
        sourceUrl = rtspUrl.trim();
        // verify the stream first so an unreachable camera is not saved
        const test = await testConnection({ rtspUrl: sourceUrl });
        setTestResult(test);
        if (!test.success) return;
      } else if (file) {
        setProgress(0);
        const up = await uploadVideo(file, setProgress);
        sourceUrl = up.url;
        fileName = file.name;
      } else if (clip) {
        sourceUrl = clip;
        fileName = clip.split('/').pop() || null;
      } else {
        setNotice({ kind: 'error', text: 'Choose a video file or a test clip.' });
        return;
      }
      const res = await addCamera({
        name: name.trim() || (mode === 'rtsp' ? `RTSP Camera ${n}` : `Video - ${fileName}`),
        location: location.trim() || (mode === 'rtsp' ? 'Not specified' : 'Uploaded video'),
        sourceType: mode === 'rtsp' ? 'rtsp' : 'upload',
        sourceUrl,
        fileName,
        startDetection: true,
      });
      if (res.detectionError) {
        setNotice({ kind: 'error', text: `Camera saved as ${res.camera.id}, but detection could not start: ${res.detectionError}` });
      } else {
        setNotice({ kind: 'ok', text: `Detection started on ${res.camera.name} (${res.camera.id}).` });
        setRtspUrl('');
        setName('');
        setFile(null);
        setTestResult(null);
        onStarted(res.camera.id);
      }
    } catch (err: any) {
      setNotice({ kind: 'error', text: err?.message || 'Unable to start detection.', code: err?.code });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const input = 'px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-red-500 text-xs text-white placeholder-slate-500 outline-none';

  return (
    <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">Quick Connect</h3>
          <span className="text-[10px] font-mono text-slate-500">RTSP / video → backend → YOLO11 → alerts</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {(['rtsp', 'video'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setNotice(null); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono cursor-pointer ${mode === m ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {m === 'rtsp' ? <Radio className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
              {m === 'rtsp' ? 'RTSP Camera' : 'Video File'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
        {mode === 'rtsp' ? (
          <input
            className={`${input} font-mono lg:col-span-6`}
            value={rtspUrl}
            onChange={e => { setRtspUrl(e.target.value); setTestResult(null); }}
            placeholder="rtsp://username:password@192.168.1.100:554/stream"
            autoComplete="off"
            spellCheck={false}
          />
        ) : (
          <div className="lg:col-span-6 flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`${input} flex-1 text-left truncate cursor-pointer hover:border-slate-700`}
            >
              {progress !== null ? `Uploading ${Math.round(progress * 100)}%...` : file ? `✓ ${file.name}` : 'Upload a video file...'}
            </button>
            <input ref={fileRef} type="file" className="hidden" accept="video/*,.mp4,.avi,.mov,.mkv,.webm,.m4v"
              onChange={e => setFile(e.target.files?.[0] || null)} />
            {clips.length > 0 && (
              <select className={`${input} font-mono cursor-pointer`} value={file ? '' : clip}
                onChange={e => { setClip(e.target.value); setFile(null); }}>
                <option value="">or test clip...</option>
                {clips.map(c => <option key={c.url} value={c.url}>{c.filename}</option>)}
              </select>
            )}
          </div>
        )}
        <input className={`${input} lg:col-span-2`} value={name} onChange={e => setName(e.target.value)} placeholder="Camera name (optional)" />
        <input className={`${input} lg:col-span-2`} value={location} onChange={e => setLocation(e.target.value)} placeholder="Location (optional)" />
        <div className="lg:col-span-2 flex gap-2">
          {mode === 'rtsp' && (
            <button type="button" onClick={handleTest} disabled={!!busy}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-200 cursor-pointer disabled:opacity-50"
              title="Test RTSP connection">
              {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5 text-cyan-400" />}
              <span>Test</span>
            </button>
          )}
          <button type="button" onClick={start} disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap">
            {busy === 'start' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-white" />}
            <span>Start Detection</span>
          </button>
        </div>
      </div>

      {testResult && (
        <div className={`p-2.5 rounded-xl border text-xs font-mono flex items-start gap-2 ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>
            {testResult.message}
            {testResult.success
              ? ` — ${testResult.resolution}${testResult.fps ? ` @ ${testResult.fps} FPS` : ''}${testResult.codec ? ` • ${testResult.codec}` : ''}`
              : ` [${testResult.code}]`}
          </span>
        </div>
      )}
      {notice && (
        <div className={`p-2.5 rounded-xl border text-xs font-mono flex items-start gap-2 ${notice.kind === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          {notice.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}
    </div>
  );
};

export const LiveMonitor: React.FC = () => {
  const navigate = useNavigate();
  const { cameras, isLoading, startDetection, stopDetection, backendOnline, error } = useCameras();
  const { flashingCameraIds, alerts } = useAlerts();

  const [layout, setLayout] = useState<'1x1' | '2x2' | '3x3'>('2x2');
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCameraId = searchParams.get('camera');
  // the focused feed lives in the URL (?camera=cam-1): shareable, back/forward friendly, same tab
  const setSelectedCameraId = (id: string | null) =>
    setSearchParams(id ? { camera: id } : {}, { replace: !id });
  const [showAiOverlay, setShowAiOverlay] = useState<boolean>(true);
  const [activeFilterCameraId, setActiveFilterCameraId] = useState<string>('all');
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const displayedCameras = activeFilterCameraId === 'all' ? cameras : cameras.filter(c => c.id === activeFilterCameraId);
  const selected = cameras.find(c => c.id === selectedCameraId) || null;
  const det = selected?.detection;
  const badge = getDetectionBadge(det);
  const cameraAccidents = selected ? alerts.filter(a => a.cameraId === selected.id) : [];

  const getGridClasses = () => {
    switch (layout) {
      case '1x1':
        return 'grid-cols-1 max-w-5xl mx-auto';
      case '2x2':
        return 'grid-cols-1 md:grid-cols-2';
      case '3x3':
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    }
  };

  const toggleSelected = async () => {
    if (!selected) return;
    setModalBusy(true);
    setModalError(null);
    try {
      if (det?.active) await stopDetection(selected.id);
      else await startDetection(selected.id);
    } catch (err: any) {
      setModalError(err?.message || 'Unable to start detection.');
    } finally {
      setModalBusy(false);
    }
  };

  const modalImage = selected
    ? det?.active
      ? detectionStreamUrl(selected.id, showAiOverlay, `modal-${det.startedAt}`)
      : det && det.framesProcessed > 0
      ? detectionSnapshotUrl(selected.id, det.endedAt || det.startedAt)
      : selected.thumbnailUrl || ''
    : '';

  return (
    <div className="space-y-6">
      {/* Top controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-white tracking-tight font-sans">Live CCTV Accident Monitor</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30">
              {cameras.filter(c => c.detection?.active).length} DETECTING
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Streams are decoded and analysed by YOLO11 on the backend; annotated frames are streamed to this dashboard
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAiOverlay(!showAiOverlay)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
              showAiOverlay ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
            <span>AI Bounding Boxes: {showAiOverlay ? 'ON' : 'OFF'}</span>
          </button>

          <select
            value={activeFilterCameraId}
            onChange={(e) => setActiveFilterCameraId(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">All Camera Feeds ({cameras.length})</option>
            {cameras.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {([['1x1', Square], ['2x2', Grid2X2], ['3x3', Grid3X3]] as const).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLayout(key)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  layout === key ? 'bg-red-600 text-white shadow-md shadow-red-600/30' : 'text-slate-400 hover:text-white'
                }`}
                title={`${key} layout`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {backendOnline === false && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-xs font-mono">{error}</div>
      )}

      <QuickConnect onStarted={(id) => setSelectedCameraId(id)} />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="rounded-2xl bg-slate-900/60 border border-slate-800 aspect-video animate-pulse" />
          ))}
        </div>
      ) : displayedCameras.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-12 text-center">
          <CameraIcon className="w-12 h-12 mx-auto text-slate-600 mb-3" />
          <h4 className="text-sm font-semibold text-slate-200">No Camera Feeds</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
            Use Quick Connect above to add an RTSP camera or a video, or manage cameras on the Dashboard.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-500 transition-colors"
          >
            Configure Camera Sources
          </button>
        </div>
      ) : (
        <div className={`grid gap-5 ${getGridClasses()}`}>
          {displayedCameras.map((camera) => (
            <VideoTile
              key={camera.id}
              camera={camera}
              isFlashing={flashingCameraIds.has(camera.id)}
              onExpand={(c) => { setSelectedCameraId(c.id); setModalError(null); }}
              compact={layout === '3x3'}
              showAiOverlay={showAiOverlay}
            />
          ))}
        </div>
      )}

      {/* Focus modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-lg overflow-y-auto animate-backdrop-in"
          onClick={() => setSelectedCameraId(null)}
        >
          <div
            className="relative w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono font-bold shrink-0 ${badge.className}`}>
                  <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                  {badge.label}
                </div>
                <span className="text-sm font-bold text-white font-mono uppercase tracking-wide truncate">{selected.name}</span>
                <span className="text-xs font-mono text-slate-400 truncate hidden md:inline">[{selected.location}]</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={toggleSelected}
                  disabled={modalBusy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-mono font-bold shadow-md cursor-pointer disabled:opacity-60 ${
                    det?.active ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
                  }`}
                >
                  {modalBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : det?.active ? <Square className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                  <span>{det?.active ? 'Stop Detection' : 'Start Detection'}</span>
                </button>
                <button type="button" onClick={() => setSelectedCameraId(null)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="force-dark relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {modalImage ? (
                <img src={modalImage} alt={selected.name} className="w-full h-full object-contain" />
              ) : (
                <div className="text-center text-slate-500 font-mono text-xs">
                  <CameraIcon className="w-10 h-10 mx-auto mb-2 text-slate-700" />
                  No frames yet — press Start Detection
                </div>
              )}
              {det?.state === 'accident' && (
                <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                  <div className="px-4 py-1.5 rounded-full bg-red-600/90 border border-red-400 text-white font-mono text-xs font-black flex items-center gap-2 animate-pulse">
                    <AlertTriangle className="w-4 h-4 fill-white" />
                    ACCIDENT DETECTED — saving {det.recordingAccidentId}.mp4
                  </div>
                </div>
              )}
            </div>

            {(modalError || (det?.error && ['error', 'disconnected', 'reconnecting'].includes(det.state))) && (
              <div className="px-6 py-3 bg-red-950/60 border-t border-red-500/30 text-red-300 text-xs font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {modalError || det?.error?.message}
              </div>
            )}

            <div className="p-5 bg-slate-900/60 border-t border-slate-800 grid grid-cols-2 md:grid-cols-5 gap-4 text-xs font-mono">
              <div className="col-span-2">
                <span className="text-slate-500 text-[10px] block mb-1">SOURCE</span>
                <span className="text-white font-semibold">{selected.sourceType === 'rtsp' ? 'RTSP STREAM' : 'VIDEO FILE'}</span>
                <p className="text-slate-400 text-[11px] truncate mt-0.5">{selected.sourceType === 'rtsp' ? selected.sourceUrl : selected.fileName || selected.sourceUrl}</p>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block mb-1">LATENCY (MEASURED)</span>
                <span className="text-white">
                  {det?.active && det.latency?.deliveryMs != null ? `${Math.round(det.latency.deliveryMs)} ms stream` : '—'}
                </span>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  {det?.active && det.latency?.detectionMs != null
                    ? `YOLO11 ${Math.round(det.latency.detectionMs)} ms · ${det.latency.engine}`
                    : 'Detection stopped'}
                </p>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block mb-1">STREAM / YOLO11</span>
                <span className="text-white">{det?.active ? `${Math.round(det.captureFps)} FPS · ${det.inferenceFps}/s` : '—'}</span>
                <p className="text-slate-400 text-[11px] mt-0.5">{det?.active ? `${det.inferenceMs} ms / inference` : 'Detection stopped'}</p>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block mb-1">FRAMES</span>
                <span className="text-white">{det?.framesProcessed ?? 0}{det?.totalFrames ? ` / ${det.totalFrames}` : ''}</span>
                <p className="text-slate-400 text-[11px] mt-0.5">{det?.resolution || selected.resolution}</p>
              </div>
              <div className="col-span-2 md:col-span-4">
                <span className="text-slate-500 text-[10px] block mb-1">SAVED ACCIDENT FOOTAGE ({cameraAccidents.length})</span>
                {cameraAccidents.length === 0 ? (
                  <span className="text-slate-500">No accident detected on this camera yet</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {cameraAccidents.slice(0, 8).map(a => (
                      <button key={a.id} type="button" onClick={() => navigate(`/alerts/${a.id}`)}
                        className="px-2 py-1 rounded bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 cursor-pointer">
                        {a.id}{a.recording ? ' (recording)' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  onClick={() => navigate(`/alerts?camera=${encodeURIComponent(selected.id)}`)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                >
                  <span>Alerts & Violations</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

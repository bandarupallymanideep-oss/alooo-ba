import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera as CameraIcon,
  Upload,
  Globe,
  Radio,
  MapPin,
  Check,
  AlertCircle,
  Film,
  Wifi,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import type { Camera, CameraInput, ConnectionTestResult, SampleClip, SourceType } from '../api/types';
import { getSampleClips, testConnection, uploadVideo } from '../api/cameras';
import type { SaveCameraResult } from '../api/cameras';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CameraInput) => Promise<SaveCameraResult>;
  cameraToEdit?: Camera | null;
  totalCamerasCount: number;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onSave,
  cameraToEdit,
  totalCamerasCount
}) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [sourceType, setSourceType] = useState<SourceType>('rtsp');
  const [rtspUrl, setRtspUrl] = useState('');
  const [videoPath, setVideoPath] = useState(''); // server path: /uploads/... or /accident_clips/...
  const [fileName, setFileName] = useState('');
  const [startAfterSave, setStartAfterSave] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedWithWarning, setSavedWithWarning] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sampleClips, setSampleClips] = useState<SampleClip[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (cameraToEdit) {
      setName(cameraToEdit.name);
      setLocation(cameraToEdit.location);
      setLatitude(cameraToEdit.latitude != null ? cameraToEdit.latitude.toString() : '');
      setLongitude(cameraToEdit.longitude != null ? cameraToEdit.longitude.toString() : '');
      setSourceType(cameraToEdit.sourceType);
      setRtspUrl(cameraToEdit.sourceType === 'rtsp' ? cameraToEdit.sourceUrl || '' : '');
      setVideoPath(cameraToEdit.sourceType === 'upload' ? cameraToEdit.sourceUrl || '' : '');
      setFileName(cameraToEdit.fileName || '');
      setStartAfterSave(cameraToEdit.status === 'Processing');
    } else {
      setName(`Camera ${totalCamerasCount + 1}`);
      setLocation('');
      setLatitude('');
      setLongitude('');
      setSourceType('rtsp');
      setRtspUrl('');
      setVideoPath('');
      setFileName('');
      setStartAfterSave(true);
    }
    setError(null);
    setSavedWithWarning(false);
    setTestResult(null);
    setUploadProgress(null);
    getSampleClips().then(setSampleClips).catch(() => setSampleClips([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraToEdit, isOpen]);

  if (!isOpen) return null;

  const sourceUrl = sourceType === 'rtsp' ? rtspUrl.trim() : videoPath;
  const urlUnchanged = !!cameraToEdit && sourceUrl === cameraToEdit.sourceUrl;

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setTestResult(null);
    setUploadProgress(0);
    try {
      const res = await uploadVideo(file, setUploadProgress);
      setVideoPath(res.url);
      setFileName(file.name);
    } catch (err: any) {
      setError(err?.message || 'Upload failed.');
      setVideoPath('');
      setFileName('');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleTest = async () => {
    if (!sourceUrl) {
      setError(sourceType === 'rtsp' ? 'Enter an RTSP URL first.' : 'Upload or choose a video first.');
      return;
    }
    setIsTesting(true);
    setError(null);
    setTestResult(null);
    const result = urlUnchanged
      ? await testConnection({ cameraId: cameraToEdit!.id })
      : await testConnection({ rtspUrl: sourceUrl });
    setTestResult(result);
    setIsTesting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savedWithWarning) {
      onClose();
      return;
    }
    if (!name.trim()) return setError('Please provide a camera name.');
    if (!location.trim()) return setError('Please provide a location name.');
    if (sourceType === 'rtsp' && !rtspUrl.trim()) return setError('Please enter the camera RTSP URL (e.g. rtsp://192.168.1.100:554/stream).');
    if (sourceType === 'rtsp' && !/^(rtsps?|https?|rtmp):\/\//i.test(rtspUrl.trim()))
      return setError('Invalid RTSP URL: it must start with rtsp:// (e.g. rtsp://192.168.1.100:554/stream).');
    if (sourceType === 'upload' && !videoPath) return setError('Please upload a video file or choose a sample clip.');

    const latNum = latitude.trim() ? parseFloat(latitude) : NaN;
    const lngNum = longitude.trim() ? parseFloat(longitude) : NaN;

    try {
      setIsSubmitting(true);
      setError(null);
      const result = await onSave({
        name: name.trim(),
        location: location.trim(),
        latitude: isNaN(latNum) ? null : latNum,
        longitude: isNaN(lngNum) ? null : lngNum,
        sourceType,
        sourceUrl,
        fileName: sourceType === 'upload' ? fileName || null : null,
        startDetection: startAfterSave,
      });
      if (result?.detectionError) {
        setError(`Camera saved, but detection could not start: ${result.detectionError}`);
        setSavedWithWarning(true);
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save camera.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto animate-backdrop-in">
      <div
        className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-in my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <CameraIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-sans">
                {cameraToEdit ? 'Edit Camera Stream' : 'Add CCTV Camera / Video Source'}
              </h3>
              <p className="text-xs text-slate-400">RTSP camera or video file for YOLO11 accident detection</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs font-mono">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-mono font-medium text-slate-300 mb-1.5">CAMERA NAME *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Camera 1 - Highway Overpass"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm text-white placeholder-slate-500 outline-none transition-all font-sans"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-mono font-medium text-slate-300 mb-1.5">LOCATION *</label>
              <div className="relative">
                <MapPin className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. NH-48 Km 112, Junction 4"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm text-white placeholder-slate-500 outline-none transition-all"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-mono font-medium text-slate-400 mb-1">LATITUDE (OPTIONAL)</label>
              <input
                type="text"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="12.9716"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white placeholder-slate-600 outline-none focus:border-slate-700"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-medium text-slate-400 mb-1">LONGITUDE (OPTIONAL)</label>
              <input
                type="text"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="77.5946"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white placeholder-slate-600 outline-none focus:border-slate-700"
              />
            </div>
          </div>

          {/* Source type */}
          <div>
            <label className="block text-xs font-mono font-medium text-slate-300 mb-2">VIDEO SOURCE *</label>
            <div className="grid grid-cols-2 gap-3">
              {(['rtsp', 'upload'] as SourceType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setSourceType(t);
                    setTestResult(null);
                  }}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    sourceType === t
                      ? 'bg-red-500/15 border-red-500/50 text-white shadow-md shadow-red-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {t === 'rtsp' ? <Radio className="w-4 h-4 text-red-400" /> : <Upload className="w-4 h-4 text-amber-400" />}
                  <span>{t === 'rtsp' ? 'RTSP Stream URL' : 'Video File'}</span>
                </button>
              ))}
            </div>
          </div>

          {sourceType === 'rtsp' ? (
            <div>
              <label className="block text-xs font-mono font-medium text-slate-400 mb-1.5">RTSP URL</label>
              <div className="relative">
                <Globe className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={rtspUrl}
                  onChange={(e) => {
                    setRtspUrl(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="rtsp://username:password@192.168.1.100:554/stream"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-red-500 text-xs font-mono text-white placeholder-slate-600 outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {cameraToEdit?.hasCredentials && urlUnchanged
                  ? 'The stored password is hidden (***). Leave the URL unchanged to keep it.'
                  : 'The backend connects to the camera; passwords are never shown in the dashboard.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-mono font-medium text-slate-400 mb-1.5">UPLOAD VIDEO</label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => uploadProgress === null && fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-xl p-5 text-center bg-slate-950/60 cursor-pointer transition-colors group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.avi,.mov,.mkv,.webm,.m4v"
                  className="hidden"
                />
                <Film className="w-8 h-8 mx-auto mb-2 text-slate-500 group-hover:text-amber-400 transition-colors" />
                {uploadProgress !== null ? (
                  <div className="text-xs font-mono text-amber-300">Uploading... {Math.round(uploadProgress * 100)}%</div>
                ) : fileName ? (
                  <div className="text-xs font-mono text-emerald-400 font-semibold truncate">✓ {fileName}</div>
                ) : (
                  <>
                    <p className="text-xs text-slate-300 font-medium">Drop an MP4 / AVI / MOV accident video here, or browse</p>
                    <p className="text-[11px] text-slate-400 mt-1">Uploaded to the backend (max 500 MB)</p>
                  </>
                )}
              </div>
              {sampleClips.length > 0 && (
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">OR USE A TEST CLIP (backend/accident_clips)</label>
                  <select
                    value={videoPath.startsWith('/accident_clips/') ? videoPath : ''}
                    onChange={(e) => {
                      const clip = sampleClips.find(c => c.url === e.target.value);
                      setVideoPath(clip ? clip.url : '');
                      setFileName(clip ? clip.filename : '');
                      setTestResult(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white outline-none cursor-pointer"
                  >
                    <option value="">-- select a test clip --</option>
                    {sampleClips.map(c => (
                      <option key={c.url} value={c.url}>{c.filename} ({c.size_mb} MB)</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Connection test */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || uploadProgress !== null}
              className="self-start flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-200 cursor-pointer disabled:opacity-50"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{isTesting ? 'Testing connection...' : 'Test Connection'}</span>
            </button>
            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2 ${
                  testResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <div>
                  <div>{testResult.message}</div>
                  {testResult.success ? (
                    <div className="text-[11px] text-emerald-400/80 mt-0.5">
                      {testResult.resolution} {testResult.fps ? `@ ${testResult.fps} FPS` : ''} {testResult.codec ? `• ${testResult.codec}` : ''}
                    </div>
                  ) : (
                    <div className="text-[10px] text-red-400/70 mt-0.5">Error code: {testResult.code}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-1">
            <label className="block text-xs font-mono font-medium text-slate-400 mb-1">AI ACCIDENT DETECTION</label>
            <select
              value={startAfterSave ? 'on' : 'off'}
              onChange={(e) => setStartAfterSave(e.target.value === 'on')}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-white outline-none focus:border-slate-700 cursor-pointer"
            >
              <option value="on">Processing - start YOLO11 detection after saving</option>
              <option value="off">Standby - save only (start later from Live Monitor)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || uploadProgress !== null}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-semibold shadow-lg shadow-red-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>
                {savedWithWarning ? 'Close' : isSubmitting ? (startAfterSave ? 'Connecting...' : 'Saving...') : cameraToEdit ? 'Save Changes' : 'Add Camera'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

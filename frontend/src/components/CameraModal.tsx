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
  CheckCircle2,
  Radar,
  RefreshCw,
  Server,
  Eye,
  ShieldCheck,
  ChevronRight,
  Info
} from 'lucide-react';
import type {
  Camera,
  CameraInput,
  ConnectionTestResult,
  SampleClip,
  SourceType,
  DiscoveredCamera,
  OnvifProbeResult,
  OnvifStreamTestResult
} from '../api/types';
import { getSampleClips, testConnection, uploadVideo } from '../api/cameras';
import { discoverOnvifCameras, probeOnvifCamera, testOnvifStream } from '../api/onvif';
import type { SaveCameraResult } from '../api/cameras';
import { LocationPickerMap } from './map/LocationPickerMap';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CameraInput) => Promise<SaveCameraResult>;
  cameraToEdit?: Camera | null;
  totalCamerasCount: number;
  initialSourceType?: SourceType;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onSave,
  cameraToEdit,
  totalCamerasCount,
  initialSourceType
}) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [sourceType, setSourceType] = useState<SourceType>(initialSourceType || 'onvif');
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

  // ONVIF Discovery State
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredCameras, setDiscoveredCameras] = useState<DiscoveredCamera[]>([]);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const [selectedDiscoveredCam, setSelectedDiscoveredCam] = useState<DiscoveredCamera | null>(null);
  const [onvifUsername, setOnvifUsername] = useState('admin');
  const [onvifPassword, setOnvifPassword] = useState('');
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<OnvifProbeResult | null>(null);
  const [selectedProfileToken, setSelectedProfileToken] = useState<string>('');
  const [isTestingStream, setIsTestingStream] = useState(false);
  const [onvifStreamTestResult, setOnvifStreamTestResult] = useState<OnvifStreamTestResult | null>(null);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('80');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Coordinate validation helpers
  const isLatValid = (val: string) => {
    if (!val.trim()) return true;
    const num = Number(val);
    return !isNaN(num) && num >= -90 && num <= 90;
  };

  const isLngValid = (val: string) => {
    if (!val.trim()) return true;
    const num = Number(val);
    return !isNaN(num) && num >= -180 && num <= 180;
  };

  const latHasError = latitude.trim() !== '' && !isLatValid(latitude);
  const lngHasError = longitude.trim() !== '' && !isLngValid(longitude);

  const numLat = latitude.trim() !== '' && !latHasError ? parseFloat(latitude) : null;
  const numLng = longitude.trim() !== '' && !lngHasError ? parseFloat(longitude) : null;

  const handleMapLocationChange = (newLat: number | null, newLng: number | null, addressSuggestion?: string) => {
    if (newLat != null && newLng != null) {
      setLatitude(newLat.toFixed(6));
      setLongitude(newLng.toFixed(6));
      setError(null);
      if (addressSuggestion) {
        if (!location.trim() || location.startsWith('Pinned Location') || location.includes(',')) {
          setLocation(addressSuggestion);
        }
      }
    } else {
      setLatitude('');
      setLongitude('');
    }
  };

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
      setSourceType(initialSourceType || 'onvif');
      setRtspUrl('');
      setVideoPath('');
      setFileName('');
      setStartAfterSave(true);
    }
    setError(null);
    setSavedWithWarning(false);
    setTestResult(null);
    setUploadProgress(null);
    setSelectedDiscoveredCam(null);
    setProbeResult(null);
    setOnvifStreamTestResult(null);
    getSampleClips().then(setSampleClips).catch(() => setSampleClips([]));

    // Auto-trigger discovery if opened in ONVIF mode
    if (!cameraToEdit && (initialSourceType === 'onvif' || sourceType === 'onvif')) {
      handleDiscover();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraToEdit, isOpen]);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setError(null);
    setDiscoveryMessage('Scanning local network via WS-Discovery (UDP multicast 239.255.255.250:3702)...');
    try {
      const res = await discoverOnvifCameras(3.0);
      setDiscoveredCameras(res.cameras || []);
      setDiscoveryMessage(res.message);
      if (res.cameras && res.cameras.length > 0) {
        handleSelectDiscoveredCamera(res.cameras[0]);
      }
    } catch (err: any) {
      setDiscoveryMessage('Network discovery scan complete: 0 cameras responded.');
      setDiscoveredCameras([]);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSelectDiscoveredCamera = (cam: DiscoveredCamera) => {
    setSelectedDiscoveredCam(cam);
    setManualIp(cam.ip);
    setManualPort(cam.port.toString());
    setProbeResult(null);
    setOnvifStreamTestResult(null);
    if (!name || name.startsWith('Camera ')) {
      setName(cam.name || `${cam.hardware || 'IP Camera'} (${cam.ip})`);
    }
    if (cam.location && !location) {
      setLocation(cam.location);
    }
  };

  const handleProbeCamera = async (targetIp?: string, targetPort?: number) => {
    const ip = targetIp || selectedDiscoveredCam?.ip || manualIp.trim();
    const port = targetPort || selectedDiscoveredCam?.port || parseInt(manualPort) || 80;
    if (!ip) {
      setError('Please enter or select a camera IP address.');
      return;
    }
    setIsProbing(true);
    setError(null);
    setProbeResult(null);
    setOnvifStreamTestResult(null);
    try {
      const result = await probeOnvifCamera({
        ip,
        port,
        username: onvifUsername.trim(),
        password: onvifPassword,
        timeout: 6.0,
      });
      setProbeResult(result);
      if (result.success && result.profiles && result.profiles.length > 0) {
        const firstProfile = result.profiles[0];
        setSelectedProfileToken(firstProfile.token);
        if (firstProfile.streamUri) {
          setRtspUrl(firstProfile.streamUri);
        }
        if (result.device?.manufacturer && result.device.model && (!name || name.startsWith('Camera '))) {
          setName(`${result.device.manufacturer} ${result.device.model} (${ip})`);
        }
      } else if (!result.success && result.auth_required) {
        setError(result.message || 'Authentication required: enter camera ONVIF username & password.');
      } else {
        setError(result.message || 'Failed to retrieve ONVIF media profiles from camera.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to camera ONVIF service.');
    } finally {
      setIsProbing(false);
    }
  };

  const handleProfileSelect = (token: string) => {
    setSelectedProfileToken(token);
    const p = probeResult?.profiles.find((x) => x.token === token);
    if (p && p.streamUri) {
      setRtspUrl(p.streamUri);
      setOnvifStreamTestResult(null);
    }
  };

  const handleTestDiscoveredStream = async () => {
    if (!rtspUrl) {
      setError('No stream URI available to test. Select a media profile first.');
      return;
    }
    setIsTestingStream(true);
    setError(null);
    setOnvifStreamTestResult(null);
    try {
      const result = await testOnvifStream(rtspUrl, 6.0);
      setOnvifStreamTestResult(result);
    } catch (err: any) {
      setError(err?.message || 'Connection test failed to read stream frames.');
    } finally {
      setIsTestingStream(false);
    }
  };

  if (!isOpen) return null;

  const sourceUrl = sourceType === 'upload' ? videoPath : rtspUrl.trim();
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
      setError(sourceType === 'upload' ? 'Upload or choose a video first.' : 'Enter an RTSP URL first.');
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

    if (sourceType === 'upload') {
      if (!videoPath) return setError('Please upload a video file or choose a sample clip.');
    } else {
      if (!rtspUrl.trim()) return setError('Please specify or discover an RTSP stream URL.');
      if (!/^(rtsps?|https?|rtmp):\/\//i.test(rtspUrl.trim()))
        return setError('Invalid stream URL: must begin with rtsp:// (e.g. rtsp://192.168.1.100:554/stream).');
    }

    const trimmedLat = latitude.trim();
    const trimmedLng = longitude.trim();

    let latNum: number | null = null;
    let lngNum: number | null = null;

    if (trimmedLat || trimmedLng) {
      if (!trimmedLat || !trimmedLng) {
        return setError('Both latitude and longitude must be provided if specifying coordinates, or leave both empty.');
      }
      const pLat = parseFloat(trimmedLat);
      const pLng = parseFloat(trimmedLng);

      if (isNaN(pLat) || pLat < -90 || pLat > 90) {
        return setError('Invalid latitude: must be a valid number between -90 and 90.');
      }
      if (isNaN(pLng) || pLng < -180 || pLng > 180) {
        return setError('Invalid longitude: must be a valid number between -180 and 180.');
      }
      latNum = pLat;
      lngNum = pLng;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const result = await onSave({
        name: name.trim(),
        location: location.trim(),
        latitude: latNum,
        longitude: lngNum,
        sourceType: sourceType === 'upload' ? 'upload' : 'rtsp',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto animate-backdrop-in">
      <div
        className="relative w-full max-w-2xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-in my-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <CameraIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-sans">
                {cameraToEdit ? 'Edit Camera Stream' : 'Add CCTV Camera / Video Source'}
              </h3>
              <p className="text-xs text-slate-400">
                ONVIF auto-discovery, manual RTSP, or video file for YOLO11 accident detection
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs font-mono shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
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
                  placeholder="e.g. NH-48 Km 112, Junction 4, or pin on map below"
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
                onChange={(e) => {
                  setLatitude(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. 18.750000 (-90 to 90)"
                className={`w-full px-3 py-2 rounded-xl bg-slate-950 border text-xs font-mono text-white placeholder-slate-600 outline-none transition-colors ${
                  latHasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-700'
                }`}
              />
              {latHasError && (
                <p className="text-[10px] text-red-400 mt-1 font-mono">Latitude must be between -90 and 90</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-mono font-medium text-slate-400 mb-1">LONGITUDE (OPTIONAL)</label>
              <input
                type="text"
                value={longitude}
                onChange={(e) => {
                  setLongitude(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. 73.400000 (-180 to 180)"
                className={`w-full px-3 py-2 rounded-xl bg-slate-950 border text-xs font-mono text-white placeholder-slate-600 outline-none transition-colors ${
                  lngHasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-700'
                }`}
              />
              {lngHasError && (
                <p className="text-[10px] text-red-400 mt-1 font-mono">Longitude must be between -180 and 180</p>
              )}
            </div>
          </div>

          {/* SELECT CAMERA LOCATION ON MAP */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-mono font-medium text-slate-300">
                SELECT CAMERA LOCATION ON MAP
              </label>
              <span className="text-[10px] font-mono text-slate-400">Click map to pin, or search place</span>
            </div>
            <LocationPickerMap
              latitude={numLat}
              longitude={numLng}
              onLocationChange={handleMapLocationChange}
              className="h-48 w-full rounded-xl"
            />
          </div>

          {/* THREE VIDEO SOURCES SELECTION */}
          <div>
            <label className="block text-xs font-mono font-medium text-slate-300 mb-2">VIDEO SOURCE *</label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSourceType('onvif');
                  setTestResult(null);
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  sourceType === 'onvif'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-white shadow-md shadow-cyan-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Radar className="w-5 h-5 text-cyan-400 mb-1" />
                <span>Discover CCTV (ONVIF)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceType('rtsp');
                  setTestResult(null);
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  sourceType === 'rtsp'
                    ? 'bg-red-500/15 border-red-500/50 text-white shadow-md shadow-red-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Radio className="w-5 h-5 text-red-400 mb-1" />
                <span>RTSP Stream URL</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceType('upload');
                  setTestResult(null);
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  sourceType === 'upload'
                    ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-md shadow-amber-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Upload className="w-5 h-5 text-amber-400 mb-1" />
                <span>Video File</span>
              </button>
            </div>
          </div>

          {/* 1. ONVIF DISCOVERY WORKFLOW */}
          {sourceType === 'onvif' && (
            <div className="space-y-3.5 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold font-mono text-cyan-400 flex items-center gap-1.5 uppercase">
                    <Radar className="w-4 h-4" /> WS-Discovery Camera Scanner
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Probes IP cameras on reachable subnet using UDP multicast (port 3702)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDiscover}
                  disabled={isDiscovering}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDiscovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isDiscovering ? 'Scanning...' : 'Discover Cameras'}</span>
                </button>
              </div>

              {discoveryMessage && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>{discoveryMessage}</span>
                </div>
              )}

              {/* Discovered Cameras List */}
              {discoveredCameras.length > 0 ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-mono text-slate-300">
                    DISCOVERED DEVICES ({discoveredCameras.length}) - SELECT TO CONFIGURE
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {discoveredCameras.map((cam) => {
                      const isSelected = selectedDiscoveredCam?.ip === cam.ip && selectedDiscoveredCam?.port === cam.port;
                      return (
                        <div
                          key={`${cam.ip}:${cam.port}`}
                          onClick={() => handleSelectDiscoveredCamera(cam)}
                          className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-cyan-500/15 border-cyan-500/60 text-white shadow-sm'
                              : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Server className={`w-4 h-4 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                            <div className="truncate">
                              <div className="font-semibold text-white truncate flex items-center gap-2">
                                <span>{cam.name || `${cam.hardware || 'Camera'} (${cam.ip})`}</span>
                                {cam.onvif_supported && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                                    ONVIF
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">
                                IP: {cam.ip}:{cam.port} {cam.hardware ? `· Model: ${cam.hardware}` : ''}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                !isDiscovering && (
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center space-y-2">
                    <p className="text-xs text-slate-400">
                      No cameras auto-discovered yet. Make sure your CCTV is on the local network.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <span className="text-[11px] font-mono text-slate-400">Or query camera IP directly:</span>
                      <input
                        type="text"
                        value={manualIp}
                        onChange={(e) => setManualIp(e.target.value)}
                        placeholder="192.168.0.50"
                        className="w-32 px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-950 border border-slate-800 text-white outline-none"
                      />
                      <input
                        type="text"
                        value={manualPort}
                        onChange={(e) => setManualPort(e.target.value)}
                        placeholder="80"
                        className="w-14 px-2 py-1 text-xs font-mono rounded-lg bg-slate-950 border border-slate-800 text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleProbeCamera()}
                        disabled={isProbing}
                        className="px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium"
                      >
                        Query
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Step 2: Credentials and Media Profiles */}
              {(selectedDiscoveredCam || manualIp) && (
                <div className="pt-2 border-t border-slate-800/80 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">ONVIF USERNAME</label>
                      <input
                        type="text"
                        value={onvifUsername}
                        onChange={(e) => setOnvifUsername(e.target.value)}
                        placeholder="admin"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">ONVIF PASSWORD</label>
                      <input
                        type="password"
                        value={onvifPassword}
                        onChange={(e) => setOnvifPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleProbeCamera()}
                    disabled={isProbing}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-cyan-300 font-semibold border border-slate-700 cursor-pointer disabled:opacity-50 transition-all"
                  >
                    {isProbing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    <span>{isProbing ? 'Connecting & Reading Profiles...' : 'Query Device & Media Profiles'}</span>
                  </button>

                  {/* Device Info & Profiles */}
                  {probeResult && probeResult.success && (
                    <div className="space-y-3 p-3 rounded-xl bg-slate-900 border border-cyan-500/20">
                      {probeResult.device && (
                        <div className="text-[11px] font-mono text-slate-300 grid grid-cols-2 gap-1 pb-2 border-b border-slate-800">
                          <div>
                            <span className="text-slate-500">Manufacturer: </span>
                            {probeResult.device.manufacturer}
                          </div>
                          <div>
                            <span className="text-slate-500">Model: </span>
                            {probeResult.device.model}
                          </div>
                          <div>
                            <span className="text-slate-500">Firmware: </span>
                            {probeResult.device.firmware}
                          </div>
                          <div>
                            <span className="text-slate-500">Auth: </span>
                            <span className="text-emerald-400 font-semibold">Verified</span>
                          </div>
                        </div>
                      )}

                      {/* Profiles selection */}
                      {probeResult.profiles && probeResult.profiles.length > 0 && (
                        <div>
                          <label className="block text-[11px] font-mono text-slate-400 mb-1">
                            AVAILABLE MEDIA PROFILES ({probeResult.profiles.length})
                          </label>
                          <select
                            value={selectedProfileToken}
                            onChange={(e) => handleProfileSelect(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white outline-none cursor-pointer"
                          >
                            {probeResult.profiles.map((p) => (
                              <option key={p.token} value={p.token}>
                                {p.name} — {p.resolution} {p.fps ? `@ ${p.fps}fps` : ''} ({p.encoding})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Stream URI preview */}
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 mb-1">RESOLVED RTSP STREAM URI</label>
                        <div className="text-[11px] font-mono px-3 py-1.5 rounded-lg bg-slate-950 text-slate-300 truncate border border-slate-800">
                          {rtspUrl ? rtspUrl.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2') : 'No stream URI'}
                        </div>
                      </div>

                      {/* Test Stream Button */}
                      <button
                        type="button"
                        onClick={handleTestDiscoveredStream}
                        disabled={isTestingStream || !rtspUrl}
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-semibold transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isTestingStream ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-4 h-4" />}
                        <span>{isTestingStream ? 'Decoding Real Frames...' : 'Test Connection & Read Frames'}</span>
                      </button>

                      {/* Stream Test Result */}
                      {onvifStreamTestResult && (
                        <div
                          className={`p-3 rounded-xl border text-xs font-mono flex flex-col gap-2 ${
                            onvifStreamTestResult.success
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : 'bg-red-500/10 border-red-500/30 text-red-300'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {onvifStreamTestResult.success ? (
                              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div className="font-semibold">{onvifStreamTestResult.message}</div>
                              {onvifStreamTestResult.success && (
                                <div className="text-[11px] text-emerald-400/80 mt-0.5">
                                  {onvifStreamTestResult.resolution} {onvifStreamTestResult.fps ? `@ ${onvifStreamTestResult.fps} FPS` : ''} · Read latency:{' '}
                                  {onvifStreamTestResult.elapsedMs || 0}ms
                                </div>
                              )}
                            </div>
                          </div>

                          {onvifStreamTestResult.thumbnail && (
                            <div className="mt-1 rounded-lg overflow-hidden border border-slate-800 bg-black aspect-video max-h-36 flex items-center justify-center">
                              <img
                                src={onvifStreamTestResult.thumbnail}
                                alt="Discovered camera live frame"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2. MANUAL RTSP URL */}
          {sourceType === 'rtsp' && (
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

              {/* Manual Connection test */}
              <div className="flex flex-col gap-2 mt-3">
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
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
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
            </div>
          )}

          {/* 3. VIDEO FILE UPLOAD */}
          {sourceType === 'upload' && (
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
                      const clip = sampleClips.find((c) => c.url === e.target.value);
                      setVideoPath(clip ? clip.url : '');
                      setFileName(clip ? clip.filename : '');
                      setTestResult(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white outline-none cursor-pointer"
                  >
                    <option value="">-- select a test clip --</option>
                    {sampleClips.map((c) => (
                      <option key={c.url} value={c.url}>
                        {c.filename} ({c.size_mb} MB)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Upload connection test */}
              <div className="flex flex-col gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={isTesting || uploadProgress !== null}
                  className="self-start flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-200 cursor-pointer disabled:opacity-50"
                >
                  {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>{isTesting ? 'Testing video file...' : 'Test Video File'}</span>
                </button>
                {testResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2 ${
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}
                  >
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <div>
                      <div>{testResult.message}</div>
                      {testResult.success && (
                        <div className="text-[11px] text-emerald-400/80 mt-0.5">
                          {testResult.resolution} {testResult.fps ? `@ ${testResult.fps} FPS` : ''} {testResult.codec ? `• ${testResult.codec}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

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
              disabled={isSubmitting || uploadProgress !== null || latHasError || lngHasError}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-semibold shadow-lg shadow-red-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>
                {savedWithWarning
                  ? 'Close'
                  : isSubmitting
                  ? startAfterSave
                    ? 'Connecting...'
                    : 'Saving...'
                  : cameraToEdit
                  ? 'Save Changes'
                  : 'Add Camera'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

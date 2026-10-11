import type { Camera, CameraInput, CameraStatus, ConnectionTestResult, DetectionStatus, SampleClip, BackendHealth } from './types';
import { apiRequest, backendUrl, uploadWithProgress, ApiError } from './client';

function mapCamera(raw: any): Camera {
  return {
    ...raw,
    thumbnailUrl: raw.thumbnailUrl ? backendUrl(raw.thumbnailUrl) : null,
    fps: raw.fps ?? 0,
    resolution: raw.resolution || 'Unknown',
  };
}

export interface SaveCameraResult {
  camera: Camera;
  /** set when the camera was saved but detection could not start (e.g. RTSP unreachable) */
  detectionError?: string;
}

function toSaveResult(res: any): SaveCameraResult {
  return {
    camera: mapCamera(res.camera),
    detectionError: res.success === false ? res.message : undefined,
  };
}

export async function getCameras(): Promise<Camera[]> {
  const res = await apiRequest<{ cameras: any[] }>('/api/cameras', { timeoutMs: 15000 });
  return res.cameras.map(mapCamera);
}

export async function getCameraById(id: string): Promise<Camera | null> {
  const cams = await getCameras();
  return cams.find(c => c.id === id) || null;
}

export async function createCamera(data: CameraInput): Promise<SaveCameraResult> {
  return toSaveResult(await apiRequest('/api/cameras', { method: 'POST', body: data, timeoutMs: 90000 }));
}

export const addCamera = createCamera;

export async function updateCamera(id: string, updates: Partial<CameraInput>): Promise<SaveCameraResult> {
  return toSaveResult(await apiRequest(`/api/cameras/${id}`, { method: 'PUT', body: updates, timeoutMs: 90000 }));
}

export async function deleteCamera(id: string): Promise<void> {
  await apiRequest(`/api/cameras/${id}`, { method: 'DELETE' });
}

/** Start YOLO11 detection on a saved camera. Throws ApiError with the RTSP diagnosis if it cannot connect. */
export async function startDetection(id: string): Promise<Camera> {
  const res = await apiRequest(`/api/cameras/${id}/start`, { method: 'POST', timeoutMs: 90000 });
  return mapCamera(res.camera);
}

export async function stopDetection(id: string): Promise<Camera> {
  const res = await apiRequest(`/api/cameras/${id}/stop`, { method: 'POST' });
  return mapCamera(res.camera);
}

/** Processing = detection running. Connected/Offline = detection stopped. */
export async function toggleCameraStatus(id: string, status: CameraStatus): Promise<Camera> {
  return status === 'Processing' ? startDetection(id) : stopDetection(id);
}

/** Test an RTSP URL (or a saved camera's stored URL). Never throws for a failed connection. */
export async function testConnection(params: { rtspUrl?: string; cameraId?: string }): Promise<ConnectionTestResult> {
  try {
    return await apiRequest<ConnectionTestResult>('/api/cctv/test-connection', {
      method: 'POST',
      body: { rtsp_url: params.rtspUrl || null, camera_id: params.cameraId || null },
      timeoutMs: 60000,
    });
  } catch (err) {
    const e = err as ApiError;
    return { success: false, status: 'error', code: e.code || 'ERROR', message: e.message };
  }
}

export async function uploadVideo(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<{ filename: string; url: string; originalName: string }> {
  const form = new FormData();
  form.append('file', file);
  return uploadWithProgress('/api/uploads', form, onProgress);
}

export async function getSampleClips(): Promise<SampleClip[]> {
  const res = await apiRequest<{ clips: SampleClip[] }>('/api/accident-clips');
  return res.clips;
}

export async function getSessions(): Promise<DetectionStatus[]> {
  const res = await apiRequest<{ sessions: DetectionStatus[] }>('/api/detect/sessions');
  return res.sessions;
}

export async function getHealth(): Promise<BackendHealth> {
  return apiRequest<BackendHealth>('/health', { timeoutMs: 8000 });
}

/** MJPEG URL of the live (annotated) detection stream. `nonce` forces the <img> to reconnect. */
export function detectionStreamUrl(sessionId: string, overlay = true, nonce: string | number = ''): string {
  return backendUrl(`/api/detect/sessions/${sessionId}/stream?overlay=${overlay}&n=${nonce}`);
}

export function detectionSnapshotUrl(sessionId: string, nonce: string | number = ''): string {
  return backendUrl(`/api/detect/sessions/${sessionId}/snapshot?n=${nonce}`);
}

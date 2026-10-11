import type { AccidentCategory, AccidentRecord, AccidentStatus, AlertFilterOptions, Camera, DashboardStats } from './types';
import { apiRequest, backendUrl } from './client';

/** Map a backend accident record (detected_accidents/accidentN.json) to the UI model. */
export function mapAccident(raw: any): AccidentRecord {
  return {
    ...raw,
    cameraId: raw.cameraId || 'unknown',
    cameraName: raw.cameraName || 'Unknown camera',
    location: raw.location || 'Unknown location',
    snapshotImage: backendUrl(raw.snapshotUrl),
    videoClipUrl: backendUrl(raw.videoClipUrl),
    confidenceScore: Number(raw.confidenceScore ?? 0),
    status: raw.status || 'New',
    severity: raw.severity || 'Moderate',
    vehiclesInvolved: raw.vehiclesInvolved ?? 1,
    collisionType: raw.collisionType || 'Road Accident',
  };
}

export function filterAlerts(records: AccidentRecord[], filters?: AlertFilterOptions): AccidentRecord[] {
  if (!filters) return records;
  const now = Date.now();
  const todayPrefix = new Date().toISOString().slice(0, 10);
  return records.filter(a => {
    if (filters.cameraId && filters.cameraId !== 'all' && a.cameraId !== filters.cameraId) return false;
    if (filters.category && filters.category !== 'all' && a.category !== filters.category) return false;
    if (filters.location && filters.location !== 'all' && a.location !== filters.location) return false;
    if (filters.dateRange && filters.dateRange !== 'all') {
      const t = new Date(a.timestamp).getTime();
      if (filters.dateRange === 'today' && !a.timestamp.startsWith(todayPrefix) && now - t > 86400000) return false;
      if (filters.dateRange === 'week' && now - t > 7 * 86400000) return false;
      if (filters.dateRange === 'month' && now - t > 30 * 86400000) return false;
    }
    if (filters.status && filters.status !== 'all' && a.status.toLowerCase() !== filters.status.toLowerCase()) return false;
    if (filters.severity && filters.severity !== 'all' && a.severity.toLowerCase() !== filters.severity.toLowerCase()) return false;
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      return (
        a.id.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        a.cameraName.toLowerCase().includes(q) ||
        a.collisionType.toLowerCase().includes(q)
      );
    }
    return true;
  });
}

export async function getAlerts(filters?: AlertFilterOptions): Promise<AccidentRecord[]> {
  const res = await apiRequest<{ accidents: any[] }>('/api/accidents', { timeoutMs: 15000 });
  return filterAlerts(res.accidents.map(mapAccident), filters);
}

export async function getAlertById(id: string): Promise<AccidentRecord | null> {
  try {
    return mapAccident(await apiRequest(`/api/accidents/${id}`));
  } catch {
    return null;
  }
}

export async function updateAlertStatus(
  id: string,
  status: AccidentStatus | undefined,
  operatorName: string = 'Operator',
  notes?: string
): Promise<AccidentRecord> {
  const raw = await apiRequest(`/api/accidents/${id}`, {
    method: 'PATCH',
    body: { status, notes, operatorName },
  });
  return mapAccident(raw);
}

/** Delete an accident alert. The backend moves its files to detected_accidents/deleted/. */
export async function deleteAlert(id: string): Promise<void> {
  await apiRequest(`/api/accidents/${id}`, { method: 'DELETE' });
}

/** Alert categories and whether the current YOLO model supports them. */
export async function getAccidentCategories(): Promise<AccidentCategory[]> {
  const res = await apiRequest<{ categories: AccidentCategory[] }>('/api/accident-categories');
  return res.categories;
}

/** Dashboard statistics computed from real backend data. */
export function computeStats(cameras: Camera[], accidents: AccidentRecord[]): DashboardStats {
  const todayStr = new Date().toISOString().slice(0, 10);
  const hourAgo = Date.now() - 3600000;
  return {
    totalCameras: cameras.length,
    activeStreams: cameras.filter(c => c.status === 'Processing').length,
    accidentsDetectedToday: accidents.filter(a => a.timestamp.startsWith(todayStr)).length,
    accidentsLastHour: accidents.filter(a => new Date(a.timestamp).getTime() >= hourAgo).length,
    pendingAlerts: accidents.filter(a => a.status === 'New').length,
    resolvedToday: accidents.filter(a => a.status === 'Resolved' && a.resolvedAt?.startsWith(todayStr)).length,
  };
}

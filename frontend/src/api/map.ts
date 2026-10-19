import { apiRequest } from './client';
import { getCameras, updateCamera } from './cameras';
import { getAlerts } from './alerts';
import type { MapMarkerItem } from '../components/map/types';

export interface MapDataResponse {
  markers: MapMarkerItem[];
  stats: {
    totalCameras: number;
    mappedCameras: number;
    totalAccidents: number;
    mappedAccidents: number;
  };
}

/**
 * Fetch consolidated map markers from SADARAKSHAK backend.
 * Uses /api/map/markers if available, with robust fallback to getCameras + getAlerts.
 */
export async function getMapData(): Promise<MapDataResponse> {
  try {
    const res = await apiRequest<MapDataResponse>('/api/map/markers', { timeoutMs: 12000 });
    if (res && Array.isArray(res.markers)) {
      return res;
    }
  } catch (e) {
    // Graceful fallback to separate cameras + alerts API
  }

  // Fallback: aggregate from existing REST endpoints
  const [cameras, accidents] = await Promise.all([
    getCameras().catch(() => []),
    getAlerts().catch(() => []),
  ]);

  const markers: MapMarkerItem[] = [];

  cameras.forEach((cam) => {
    const lat = typeof cam.latitude === 'number' && !isNaN(cam.latitude) ? cam.latitude : null;
    const lng = typeof cam.longitude === 'number' && !isNaN(cam.longitude) ? cam.longitude : null;
    const hasCoords = lat != null && lng != null;

    const camId = cam.id.startsWith('cam-') ? cam.id : `cam-${cam.id}`;
    markers.push({
      id: camId,
      rawId: cam.id,
      type: 'camera',
      title: cam.name || `Camera ${cam.id}`,
      subtitle: cam.location || 'CCTV Video Node',
      latitude: lat,
      longitude: lng,
      hasCoordinates: hasCoords,
      status: cam.status || 'Offline',
      info: {
        sourceType: cam.sourceType,
        resolution: cam.resolution,
        fps: cam.fps,
        autoStart: cam.autoStart ? 'Yes' : 'No',
        detectionState: cam.detection?.state || (cam.status === 'Processing' ? 'Active' : 'Idle'),
        updatedAt: cam.updatedAt || cam.createdAt,
      },
    });
  });

  accidents.forEach((acc) => {
    const lat = typeof acc.latitude === 'number' && !isNaN(acc.latitude) ? acc.latitude : null;
    const lng = typeof acc.longitude === 'number' && !isNaN(acc.longitude) ? acc.longitude : null;
    const hasCoords = lat != null && lng != null;

    const accId = acc.id.startsWith('incident-') ? acc.id : `incident-${acc.id}`;
    markers.push({
      id: accId,
      rawId: acc.id,
      type: 'incident',
      title: `Incident ${acc.id.toUpperCase()}`,
      subtitle: acc.categoryLabel || acc.collisionType || acc.location,
      latitude: lat,
      longitude: lng,
      hasCoordinates: hasCoords,
      status: acc.status || 'New',
      severity: acc.severity || 'Moderate',
      info: {
        collisionType: acc.collisionType,
        confidence: `${acc.confidenceScore?.toFixed(1) || 0}%`,
        vehiclesInvolved: acc.vehiclesInvolved,
        cameraName: acc.cameraName,
        timestamp: acc.timestamp,
        location: acc.location,
      },
    });
  });

  return {
    markers,
    stats: {
      totalCameras: cameras.length,
      mappedCameras: markers.filter((m) => m.type === 'camera' && m.hasCoordinates).length,
      totalAccidents: accidents.length,
      mappedAccidents: markers.filter((m) => m.type === 'incident' && m.hasCoordinates).length,
    },
  };
}

/**
 * Assign GPS coordinates to an existing camera
 */
export async function assignCameraCoordinates(
  cameraId: string,
  latitude: number,
  longitude: number
): Promise<void> {
  await updateCamera(cameraId, { latitude, longitude });
}

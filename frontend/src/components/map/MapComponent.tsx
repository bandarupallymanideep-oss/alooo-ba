import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapComponentProps, MapMarkerItem } from './types';

// Fix default Leaflet icon URL resolution to avoid 404s (as in Nirikshan MapComponent)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Helper for building custom marker icons
function createMarkerIcon(type?: string, status?: string, severity?: string): L.DivIcon | L.Icon {
  if (type === 'camera') {
    const isProcessing = status?.toLowerCase() === 'processing';
    const isConnected = status?.toLowerCase() === 'connected';
    const isActive = isProcessing || isConnected;
    const bgCol = isProcessing ? '#06b6d4' : (isActive ? '#10b981' : '#64748b');
    const glowCol = isProcessing ? 'rgba(6, 182, 212, 0.45)' : (isActive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.2)');
    const statusText = isProcessing ? 'DETECTING' : (isActive ? 'ONLINE' : 'OFFLINE');

    return L.divIcon({
      className: 'nirikshan-camera-marker',
      html: `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${isActive ? `<div style="position: absolute; inset: 0; border-radius: 9999px; background: ${glowCol}; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
          <div style="position: relative; width: 28px; height: 28px; border-radius: 9999px; background: #0f172a; border: 2px solid ${bgCol}; box-shadow: 0 0 10px ${bgCol}; display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          <div style="position: absolute; -bottom: 12px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.85); border: 1px solid ${bgCol}; color: ${bgCol}; font-size: 8px; font-weight: 700; font-family: monospace; padding: 1px 4px; border-radius: 4px; white-space: nowrap; pointer-events: none;">
            ${statusText}
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20]
    });
  }

  if (type === 'incident') {
    const isCritical = severity?.toLowerCase() === 'critical' || severity?.toLowerCase() === 'high';
    const bgCol = isCritical ? '#dc2626' : '#ef4444';
    const glowCol = isCritical ? 'rgba(220, 38, 38, 0.6)' : 'rgba(239, 68, 68, 0.45)';

    return L.divIcon({
      className: 'nirikshan-incident-marker',
      html: `
        <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="position: absolute; inset: 0; border-radius: 9999px; background: ${glowCol}; animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 30px; height: 30px; border-radius: 9999px; background: #7f1d1d; border: 2px solid ${bgCol}; box-shadow: 0 0 12px ${bgCol}; display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div style="position: absolute; -bottom: 12px; left: 50%; transform: translateX(-50%); background: rgba(127, 29, 29, 0.95); border: 1px solid #ef4444; color: #fecaca; font-size: 8px; font-weight: 800; font-family: monospace; padding: 1px 4px; border-radius: 4px; white-space: nowrap; pointer-events: none;">
            ALERT
          </div>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -22]
    });
  }

  if (type === 'pin') {
    return L.divIcon({
      className: 'nirikshan-pin-marker',
      html: `
        <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="position: absolute; inset: 0; border-radius: 9999px; background: rgba(59, 130, 246, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 24px; height: 24px; border-radius: 9999px; background: #2563eb; border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(37,99,235,0.9); display: flex; align-items: center; justify-content: center;">
            <div style="width: 6px; height: 6px; border-radius: 9999px; background: #ffffff;"></div>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18]
    });
  }

  // Standard Leaflet Icon
  return new L.Icon.Default();
}

/**
 * MapComponent extracted and enhanced from Nirikshan repository.
 * Preserves the original onLocationSelect, marker, initialZoom, and interactive properties.
 */
export const MapComponent: React.FC<MapComponentProps> = ({
  onLocationSelect,
  marker,
  markers = [],
  onMarkerSelect,
  center = [18.75, 73.4], // Default Pune-Mumbai highway coordinates from Nirikshan
  initialZoom = 10,
  interactive = true,
  className = 'h-full w-full',
  tileLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  refreshTrigger
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const singleMarkerRef = useRef<L.Marker | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapInstanceRef.current) {
      // Clear any prior leaflet container identifier (prevents React 19 StrictMode double-init errors)
      if ((containerRef.current as any)._leaflet_id) {
        delete (containerRef.current as any)._leaflet_id;
      }

      const initialCenter: [number, number] = marker && marker.latitude != null && marker.longitude != null
        ? [marker.latitude, marker.longitude]
        : center;

      const map = L.map(containerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: interactive,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        boxZoom: interactive,
        attributionControl: true
      });

      const tileLayer = L.tileLayer(tileLayerUrl, {
        attribution: tileAttribution,
        maxZoom: 19,
        subdomains: 'abc'
      }).addTo(map);

      tileLayerRef.current = tileLayer;

      // Group for markers
      const markerGroup = L.layerGroup().addTo(map);
      markerGroupRef.current = markerGroup;

      // Click event for location selection (retained from Nirikshan)
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (onLocationSelect) {
          onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      });

      mapInstanceRef.current = map;

      // Invalidate size once map element settles
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      // Clean up map when component unmounts
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        markerGroupRef.current = null;
        singleMarkerRef.current = null;
      }
    };
  }, []);

  // Update tile layer if URL changes (e.g. user toggles dark / street view)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }
    const tileLayer = L.tileLayer(tileLayerUrl, {
      attribution: tileAttribution,
      maxZoom: 19,
      subdomains: 'abc'
    }).addTo(mapInstanceRef.current);
    tileLayerRef.current = tileLayer;
  }, [tileLayerUrl, tileAttribution]);

  // Update center/view if changed externally
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (marker && marker.latitude != null && marker.longitude != null && !isNaN(marker.latitude) && !isNaN(marker.longitude)) {
      mapInstanceRef.current.setView([marker.latitude, marker.longitude], Math.max(mapInstanceRef.current.getZoom(), 12));
    }
  }, [marker?.latitude, marker?.longitude]);

  // Handle single marker (Nirikshan legacy API)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (singleMarkerRef.current) {
      singleMarkerRef.current.remove();
      singleMarkerRef.current = null;
    }

    if (marker && marker.latitude != null && marker.longitude != null && !isNaN(marker.latitude) && !isNaN(marker.longitude)) {
      const pinIcon = createMarkerIcon('pin');
      const newMarker = L.marker([marker.latitude, marker.longitude], { icon: pinIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family: system-ui, sans-serif; font-size: 12px; color: #0f172a; padding: 4px; min-width: 140px;">
            <div style="font-weight: 700; color: #1e3a8a; margin-bottom: 2px;">Selected Pinpoint</div>
            <div style="font-family: monospace; font-size: 11px; color: #334155;">
              ${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}
            </div>
          </div>
        `);
      singleMarkerRef.current = newMarker;
    }
  }, [marker]);

  // Handle collection of markers (CCTVs, Accidents, etc.)
  useEffect(() => {
    if (!mapInstanceRef.current || !markerGroupRef.current) return;

    markerGroupRef.current.clearLayers();

    markers.forEach((item: MapMarkerItem) => {
      if (item.latitude == null || item.longitude == null || isNaN(item.latitude) || isNaN(item.longitude)) {
        return;
      }

      const icon = createMarkerIcon(item.type, item.status, item.severity);
      const m = L.marker([item.latitude, item.longitude], { icon });

      const isIncident = item.type === 'incident';
      const statusBg = item.status?.toLowerCase() === 'active' || item.status?.toLowerCase() === 'connected' || item.status?.toLowerCase() === 'processing'
        ? '#dcfce7; color: #15803d'
        : '#f1f5f9; color: #475569';

      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; min-width: 180px; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: ${isIncident ? '#b91c1c' : '#0369a1'};">
              ${isIncident ? '🚨 ACCIDENT ALERT' : '📹 CCTV CAMERA'}
            </span>
            ${item.status ? `<span style="padding: 1px 5px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; background: ${statusBg};">${item.status}</span>` : ''}
          </div>
          <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 2px;">
            ${item.title}
          </div>
          ${item.subtitle ? `<div style="font-size: 11px; color: #475569; margin-bottom: 4px;">${item.subtitle}</div>` : ''}
          <div style="font-family: monospace; font-size: 10px; color: #64748b; background: #f8fafc; padding: 3px 6px; border-radius: 4px; border: 1px solid #e2e8f0; margin-top: 4px;">
            📍 ${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}
          </div>
        </div>
      `;

      m.bindPopup(popupHtml);
      m.on('click', () => {
        if (onMarkerSelect) onMarkerSelect(item);
      });

      markerGroupRef.current?.addLayer(m);
    });

    // Invalidate size in case parent container transitioned
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 150);
  }, [markers, onMarkerSelect]);

  // Handle external refresh trigger or window resize
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [refreshTrigger]);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export default MapComponent;

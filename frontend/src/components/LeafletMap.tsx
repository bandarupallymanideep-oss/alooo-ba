import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default Leaflet marker icon URL resolution
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface LeafletMapProps {
  latitude?: number;
  longitude?: number;
  locationName: string;
  cameraName?: string;
  incidentId?: string;
  zoom?: number;
  className?: string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  latitude = 37.7749,
  longitude = -122.4194,
  locationName,
  cameraName,
  incidentId,
  zoom = 14,
  className = 'h-52 w-full rounded-xl overflow-hidden'
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Check if map already exists
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [latitude, longitude],
        zoom: zoom,
        zoomControl: true,
        attributionControl: false
      });

      // Dark Matter tile layer (CartoDB) with fallback
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(map);

      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView([latitude, longitude], zoom);
    }

    // Custom pulsing target radar marker icon
    const customIcon = L.divIcon({
      className: 'custom-radar-pin',
      html: `
        <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 32px; height: 32px; border-radius: 9999px; background: rgba(239, 68, 68, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: absolute; width: 20px; height: 20px; border-radius: 9999px; background: #ef4444; border: 2px solid #ffffff; box-shadow: 0 0 10px #ef4444; display: flex; align-items: center; justify-content: center;">
            <div style="width: 6px; height: 6px; border-radius: 9999px; background: #ffffff;"></div>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    // Remove previous marker
    if (markerRef.current) {
      markerRef.current.remove();
    }

    // Add marker with popup
    const popupContent = `
      <div style="background: #090d16; color: #f8fafc; padding: 4px; font-family: monospace; font-size: 11px;">
        <div style="color: #ef4444; font-weight: bold; margin-bottom: 2px;">⚠ INCIDENT PINPOINT</div>
        <div style="color: #ffffff; font-weight: 600;">${locationName}</div>
        ${cameraName ? `<div style="color: #94a3b8; font-size: 10px;">${cameraName}</div>` : ''}
        ${incidentId ? `<div style="color: #38bdf8; font-size: 10px; margin-top: 2px;">ID: ${incidentId}</div>` : ''}
        <div style="color: #64748b; font-size: 9px; margin-top: 2px;">${latitude.toFixed(4)}, ${longitude.toFixed(4)}</div>
      </div>
    `;

    const marker = L.marker([latitude, longitude], { icon: customIcon })
      .addTo(mapInstanceRef.current)
      .bindPopup(popupContent);

    markerRef.current = marker;

    // Invalidate size after layout renders
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 250);

    return () => {
      // Map cleanup on unmount
    };
  }, [latitude, longitude, locationName, cameraName, incidentId, zoom]);

  // Cleanup on complete unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className={`relative border border-slate-800 ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />
      {/* Coordinates HUD overlay tag */}
      <div className="absolute bottom-2 right-2 z-[400] px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-300 backdrop-blur-sm pointer-events-none">
        {latitude.toFixed(4)}°N, {Math.abs(longitude).toFixed(4)}°W
      </div>
    </div>
  );
};

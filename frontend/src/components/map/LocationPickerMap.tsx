import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Crosshair,
  RotateCcw,
  Search,
  Loader2,
  Navigation,
  Check,
  AlertCircle
} from 'lucide-react';
import { reverseGeocode, searchPlaces, type GeocodingResult } from '../../utils/geocoding';

// Leaflet default icon fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Create custom pulsing camera location pin
function createPickerPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'picker-pin-marker',
    html: `
      <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: grab;">
        <div style="position: absolute; inset: 0; border-radius: 9999px; background: rgba(239, 68, 68, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 28px; height: 28px; border-radius: 9999px; background: #dc2626; border: 2.5px solid #ffffff; box-shadow: 0 0 12px rgba(220, 38, 38, 0.8); display: flex; align-items: center; justify-content: center; color: white;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20]
  });
}

export interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (lat: number | null, lng: number | null, address?: string) => void;
  className?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
}

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  latitude,
  longitude,
  onLocationChange,
  className = 'h-64 w-full rounded-xl',
  initialCenter = [18.75, 73.4], // Default corridor
  initialZoom = 11
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  const hasValidCoords = latitude != null && longitude != null && !isNaN(latitude) && !isNaN(longitude);

  // Initialize Leaflet Map inside Modal
  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapInstanceRef.current) {
      if ((containerRef.current as any)._leaflet_id) {
        delete (containerRef.current as any)._leaflet_id;
      }

      const center: [number, number] = hasValidCoords
        ? [latitude, longitude]
        : initialCenter;

      const map = L.map(containerRef.current, {
        center,
        zoom: hasValidCoords ? 14 : initialZoom,
        zoomControl: true,
        attributionControl: true
      });

      // Standard OpenStreetMap tiles - Free, reliable, NO API KEY REQUIRED
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: 'abc',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      }).addTo(map);

      tileLayer.on('tileerror', () => {
        setTileError(true);
      });

      // Map Click Handler: Place/move marker and reverse geocode
      map.on('click', async (e: L.LeafletMouseEvent) => {
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));

        setStatusMessage('Resolving location name...');
        const address = await reverseGeocode(lat, lng);
        setStatusMessage(null);

        onLocationChange(lat, lng, address || undefined);
      });

      mapInstanceRef.current = map;

      // Handle Modal transition resizing: invalidate size repeatedly to prevent gray tiles
      const timers = [
        setTimeout(() => map.invalidateSize(), 100),
        setTimeout(() => map.invalidateSize(), 250),
        setTimeout(() => map.invalidateSize(), 500)
      ];

      // ResizeObserver handles dynamic layout/modal changes
      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize();
        });
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        timers.forEach(clearTimeout);
        if (resizeObserver) resizeObserver.disconnect();
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
          markerRef.current = null;
        }
      };
    }
  }, []);

  // Sync Marker & Pan when latitude/longitude props change (bidirectional sync)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (hasValidCoords) {
      const latLng: [number, number] = [latitude!, longitude!];

      if (!markerRef.current) {
        const icon = createPickerPinIcon();
        const m = L.marker(latLng, { icon, draggable: true })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div style="font-family: system-ui, sans-serif; font-size: 11px; padding: 2px;">
              <strong>Camera Location</strong><br/>
              ${latitude!.toFixed(5)}, ${longitude!.toFixed(5)}
            </div>
          `);

        m.on('dragend', async (event: any) => {
          const newPos = event.target.getLatLng();
          const lat = Number(newPos.lat.toFixed(6));
          const lng = Number(newPos.lng.toFixed(6));
          setStatusMessage('Resolving location name...');
          const address = await reverseGeocode(lat, lng);
          setStatusMessage(null);
          onLocationChange(lat, lng, address || undefined);
        });

        markerRef.current = m;
      } else {
        markerRef.current.setLatLng(latLng);
      }

      // Smoothly pan to coordinates
      mapInstanceRef.current.panTo(latLng);
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    }
  }, [latitude, longitude, hasValidCoords, onLocationChange]);

  // Handle Search Execution
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setStatusMessage('Searching place...');
    try {
      const results = await searchPlaces(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        setStatusMessage('No matching locations found.');
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage(null);
      }
    } catch {
      setStatusMessage('Search request failed.');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsSearching(false);
    }
  };

  // Select a search result
  const handleSelectSearchResult = (result: GeocodingResult) => {
    setSearchResults([]);
    setSearchQuery('');
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([result.latitude, result.longitude], 15);
    }
    onLocationChange(result.latitude, result.longitude, result.shortAddress || result.displayName);
  };

  // "Use My Location" via navigator.geolocation
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setStatusMessage('Geolocation is not supported by your browser.');
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }

    setIsGeolocating(true);
    setStatusMessage('Requesting GPS location...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsGeolocating(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));

        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 15);
        }

        setStatusMessage('Resolving address...');
        const address = await reverseGeocode(lat, lng);
        setStatusMessage(null);

        onLocationChange(lat, lng, address || undefined);
      },
      (err) => {
        setIsGeolocating(false);
        let msg = 'Could not retrieve your location.';
        if (err.code === 1) msg = 'Location access was denied.';
        else if (err.code === 2) msg = 'Location unavailable.';
        else if (err.code === 3) msg = 'Location request timed out.';
        setStatusMessage(msg);
        setTimeout(() => setStatusMessage(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // Clear Location
  const handleClearLocation = () => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    setSearchResults([]);
    setSearchQuery('');
    setStatusMessage(null);
    onLocationChange(null, null);
  };

  return (
    <div className="space-y-2">
      {/* Top Controls: Search Bar + Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        {/* Place search input */}
        <div className="relative flex-1">
          <form onSubmit={handleSearch} className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city, highway, or landmark..."
              className="w-full pl-8 pr-16 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white placeholder-slate-500 outline-none focus:border-red-500 transition-colors"
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Find'}
            </button>
          </form>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-[600] rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
              {searchResults.map((res, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectSearchResult(res)}
                  className="w-full text-left p-2.5 hover:bg-slate-800/80 border-b border-slate-800/60 last:border-0 text-xs transition-colors cursor-pointer flex items-start gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">{res.shortAddress}</div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">{res.displayName}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons: Use My Location & Clear Location */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={isGeolocating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono transition-colors disabled:opacity-50 cursor-pointer"
            title="Locate my position via browser GPS"
          >
            {isGeolocating ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <Navigation className="w-3.5 h-3.5 text-cyan-400" />}
            <span>My Location</span>
          </button>

          {hasValidCoords && (
            <button
              type="button"
              onClick={handleClearLocation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-red-400 text-xs font-mono transition-colors cursor-pointer"
              title="Remove location selection"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-950/60 border border-blue-500/30 text-xs font-mono text-blue-300 animate-fadeIn">
          <Loader2 className="w-3 h-3 animate-spin shrink-0 text-blue-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Leaflet Map Box */}
      <div className={`relative overflow-hidden border border-slate-800 bg-slate-950 ${className}`}>
        <div ref={containerRef} className="h-full w-full" />

        {/* Floating Instruction Tag */}
        <div className="absolute top-2 left-2 z-[400] px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-800 text-[10px] font-mono text-slate-300 backdrop-blur-sm pointer-events-none flex items-center gap-1.5 shadow-md">
          <Crosshair className="w-3 h-3 text-red-400" />
          <span>Click map to place camera pin</span>
        </div>

        {/* Coordinates HUD overlay */}
        {hasValidCoords && (
          <div className="absolute bottom-2 right-2 z-[400] px-2.5 py-1 rounded-lg bg-slate-950/90 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 backdrop-blur-sm pointer-events-none shadow-lg flex items-center gap-1.5">
            <Check className="w-3 h-3 text-emerald-400" />
            <span>{latitude!.toFixed(5)}, {longitude!.toFixed(5)}</span>
          </div>
        )}

        {/* Tile Offline Warning */}
        {tileError && (
          <div className="absolute bottom-2 left-2 z-[400] px-2 py-1 rounded-lg bg-amber-950/90 border border-amber-500/40 text-[10px] font-mono text-amber-300 backdrop-blur-sm pointer-events-none flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <span>Map tiles offline (Manual coordinates active)</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationPickerMap;

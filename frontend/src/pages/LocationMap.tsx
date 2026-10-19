import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapPin,
  Video,
  AlertTriangle,
  Search,
  RefreshCw,
  Compass,
  Crosshair,
  Layers,
  Check,
  Copy,
  Info,
  Maximize2
} from 'lucide-react';
import { MapComponent } from '../components/map/MapComponent';
import { LocationDetailsView } from '../components/map/LocationDetailsView';
import type { MapMarkerItem, LatLng } from '../components/map/types';
import { getMapData, assignCameraCoordinates, type MapDataResponse } from '../api/map';
import { useCameras } from '../context/CameraContext';

type AssetFilter = 'all' | 'camera' | 'incident' | 'unmapped';
type TileProvider = 'dark' | 'osm';

export const LocationMap: React.FC = () => {
  const navigate = useNavigate();
  const { refreshCameras } = useCameras();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapDataResponse>({
    markers: [],
    stats: { totalCameras: 0, mappedCameras: 0, totalAccidents: 0, mappedAccidents: 0 }
  });

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'offline' | 'new'>('all');
  const [tileProvider, setTileProvider] = useState<TileProvider>('dark');

  // Selected item for details side panel
  const [selectedMarker, setSelectedMarker] = useState<MapMarkerItem | null>(null);

  // Coordinate Picking tool
  const [isPickingMode, setIsPickingMode] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<LatLng | null>(null);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [isSavingCoords, setIsSavingCoords] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Map view center & zoom
  const [mapCenter, setMapCenter] = useState<[number, number]>([18.75, 73.4]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Tile layers - using standard OpenStreetMap (no API key required, zero watermarks)
  const tileConfig = useMemo(() => {
    return {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
    };
  }, []);

  const [searchParams] = useSearchParams();

  // Load Map Data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMapData();
      setMapData(data);

      const targetId = searchParams.get('id') || searchParams.get('camera');
      if (targetId) {
        const found = data.markers.find(
          m => m.id === targetId || m.rawId === targetId || m.id === `cam-${targetId}` || m.id === `incident-${targetId}`
        );
        if (found) {
          setSelectedMarker(found);
          if (found.latitude != null && found.longitude != null) {
            setMapCenter([found.latitude, found.longitude]);
          }
          return;
        }
      }

      // Auto-center on first mapped asset if available and not yet set
      const firstMapped = data.markers.find(m => m.hasCoordinates && m.latitude != null && m.longitude != null);
      if (firstMapped && firstMapped.latitude != null && firstMapped.longitude != null) {
        setMapCenter([firstMapped.latitude, firstMapped.longitude]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to retrieve location telemetry from backend.');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered markers
  const filteredMarkers = useMemo(() => {
    return mapData.markers.filter((item) => {
      // Type filter
      if (assetFilter === 'camera' && item.type !== 'camera') return false;
      if (assetFilter === 'incident' && item.type !== 'incident') return false;
      if (assetFilter === 'unmapped' && item.hasCoordinates) return false;

      // Status filter
      if (statusFilter === 'active') {
        const s = item.status?.toLowerCase();
        if (s !== 'active' && s !== 'connected' && s !== 'processing') return false;
      } else if (statusFilter === 'offline') {
        if (item.status?.toLowerCase() !== 'offline') return false;
      } else if (statusFilter === 'new') {
        if (item.status?.toLowerCase() !== 'new') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = item.title.toLowerCase().includes(q);
        const subMatch = (item.subtitle || '').toLowerCase().includes(q);
        const idMatch = item.id.toLowerCase().includes(q);
        const rawIdMatch = (item.rawId || '').toLowerCase().includes(q);
        if (!titleMatch && !subMatch && !idMatch && !rawIdMatch) return false;
      }

      return true;
    });
  }, [mapData.markers, assetFilter, statusFilter, searchQuery]);

  // Plotted markers (only those with valid GPS coordinates)
  const mappedMarkers = useMemo(() => {
    return filteredMarkers.filter(m => m.hasCoordinates && m.latitude != null && m.longitude != null);
  }, [filteredMarkers]);

  // Unmapped assets count
  const unmappedCount = useMemo(() => {
    return mapData.markers.filter(m => !m.hasCoordinates).length;
  }, [mapData.markers]);

  // Handle marker selection
  const handleMarkerSelect = (marker: MapMarkerItem) => {
    setSelectedMarker(marker);
    if (marker.latitude != null && marker.longitude != null) {
      setMapCenter([marker.latitude, marker.longitude]);
    }
  };

  // Handle location pick on map click
  const handleLocationSelect = (latlng: LatLng) => {
    setPickedLocation(latlng);
    setCopiedCoords(false);
  };

  // Copy picked coordinates
  const handleCopyPicked = () => {
    if (pickedLocation) {
      navigator.clipboard.writeText(`${pickedLocation.lat.toFixed(6)}, ${pickedLocation.lng.toFixed(6)}`);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 2000);
    }
  };

  // Assign picked location to selected camera
  const handleAssignCoordinates = async (camId: string) => {
    if (!pickedLocation) return;
    setIsSavingCoords(true);
    try {
      await assignCameraCoordinates(camId, pickedLocation.lat, pickedLocation.lng);
      setSuccessToast(`GPS coordinates assigned to Camera ${camId}`);
      setTimeout(() => setSuccessToast(null), 3000);
      await loadData();
      await refreshCameras();
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      setError(err?.message || 'Failed to save camera coordinates.');
    } finally {
      setIsSavingCoords(false);
    }
  };

  // Action button click in details view
  const handleActionClick = (item: MapMarkerItem) => {
    if (item.type === 'camera') {
      navigate(`/live?camera=${item.rawId || item.id}`);
    } else if (item.type === 'incident') {
      navigate(`/alerts/${item.rawId || item.id}`);
    }
  };

  // Reset to default corridor view
  const handleResetCorridor = () => {
    setMapCenter([18.75, 73.4]);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-3 lg:p-5 overflow-hidden">
      {/* Top Header & Telemetry Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 text-white shadow-lg shadow-red-600/20">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-white tracking-tight">
                  LOCATION MAP & ASSET TRACKING
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  GIS TELEMETRY
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Real-time geographical positions for CCTV surveillance nodes and automated accident detections
              </p>
            </div>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>CCTV:</span>
            </span>
            <span className="text-white font-bold">{mapData.stats.mappedCameras}</span>
            <span className="text-slate-500">/ {mapData.stats.totalCameras}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-red-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>INCIDENTS:</span>
            </span>
            <span className="text-white font-bold">{mapData.stats.mappedAccidents}</span>
            <span className="text-slate-500">/ {mapData.stats.totalAccidents}</span>
          </div>

          {unmappedCount > 0 && (
            <button
              type="button"
              onClick={() => setAssetFilter(assetFilter === 'unmapped' ? 'all' : 'unmapped')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                assetFilter === 'unmapped'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-900/80 text-amber-400/90 border border-amber-500/30 hover:bg-slate-800'
              }`}
              title="Filter unmapped assets"
            >
              <Info className="w-3.5 h-3.5" />
              <span>{unmappedCount} Unmapped</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh map assets"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Control Bar: Search, Filters, Tools, and Tile Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 p-2.5 mb-3 rounded-2xl bg-slate-900/80 border border-slate-800/90 backdrop-blur-md shrink-0">
        {/* Left: Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cameras, accident ID, or location..."
            className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-xs text-white placeholder-slate-500 outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Center: Type Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          {(
            [
              { id: 'all', label: 'All Assets', icon: Layers },
              { id: 'camera', label: 'Cameras', icon: Video },
              { id: 'incident', label: 'Incidents', icon: AlertTriangle },
              { id: 'unmapped', label: 'Unmapped', icon: Info },
            ] as const
          ).map((btn) => {
            const Icon = btn.icon;
            const active = assetFilter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setAssetFilter(btn.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/30 font-semibold'
                    : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{btn.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Map Actions (Pick Coordinates, Tile Toggle, Reset View) */}
        <div className="flex items-center gap-2">
          {/* Coordinate Picker Toggle */}
          <button
            type="button"
            onClick={() => setIsPickingMode(!isPickingMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
              isPickingMode
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800/60'
            }`}
            title={isPickingMode ? 'Exit coordinate picker' : 'Click to inspect/pick coordinates on map'}
          >
            <Crosshair className={`w-3.5 h-3.5 ${isPickingMode ? 'animate-spin' : ''}`} />
            <span>{isPickingMode ? 'Picking Active' : 'Pick GPS'}</span>
          </button>

          {/* Tile Switcher */}
          <div className="flex items-center bg-slate-950/80 rounded-xl border border-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => setTileProvider('dark')}
              className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                tileProvider === 'dark' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Dark Mode map view"
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => setTileProvider('osm')}
              className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                tileProvider === 'osm' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Standard OpenStreetMap street view"
            >
              Street
            </button>
          </div>

          {/* Reset Corridor Center */}
          <button
            type="button"
            onClick={handleResetCorridor}
            className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Reset view to Pune-Mumbai corridor"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Coordinate Picked Banner (if clicked or in picking mode) */}
      {(pickedLocation || isPickingMode) && (
        <div className="flex items-center justify-between p-2.5 px-4 mb-3 rounded-xl bg-blue-950/50 border border-blue-500/30 text-xs font-mono text-blue-200 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-blue-400 animate-pulse" />
            {pickedLocation ? (
              <span>
                Selected Coordinate: <strong className="text-white">{pickedLocation.lat.toFixed(6)}, {pickedLocation.lng.toFixed(6)}</strong>
              </span>
            ) : (
              <span className="text-blue-300">
                Click anywhere on the map to inspect or select GPS coordinates
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {pickedLocation && (
              <>
                <button
                  type="button"
                  onClick={handleCopyPicked}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-white border border-blue-500/40 transition-colors cursor-pointer"
                >
                  {copiedCoords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCoords ? 'Copied' : 'Copy GPS'}</span>
                </button>

                {selectedMarker && selectedMarker.type === 'camera' && !selectedMarker.hasCoordinates && (
                  <button
                    type="button"
                    onClick={() => handleAssignCoordinates(selectedMarker.rawId || selectedMarker.id.replace('cam-', ''))}
                    disabled={isSavingCoords}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-md"
                  >
                    <Check className="w-3 h-3" />
                    <span>{isSavingCoords ? 'Saving...' : `Assign to ${selectedMarker.title}`}</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setIsPickingMode(false);
                setPickedLocation(null);
              }}
              className="text-slate-400 hover:text-white px-2 py-0.5 rounded text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {successToast && (
        <div className="p-2.5 px-4 mb-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-xs font-mono text-emerald-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 mb-3 rounded-xl bg-red-950/60 border border-red-500/50 text-xs text-red-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-2.5 py-1 rounded bg-red-800 hover:bg-red-700 text-white font-mono text-[11px] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Split Layout: Interactive Map + Side Directory / Details Panel */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
        {/* Left: Map Container */}
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-slate-800/90 shadow-2xl bg-slate-950 min-h-[350px]">
          <MapComponent
            center={mapCenter}
            initialZoom={10}
            interactive={true}
            markers={mappedMarkers}
            marker={pickedLocation ? { latitude: pickedLocation.lat, longitude: pickedLocation.lng } : null}
            onMarkerSelect={handleMarkerSelect}
            onLocationSelect={handleLocationSelect}
            tileLayerUrl={tileConfig.url}
            tileAttribution={tileConfig.attribution}
            refreshTrigger={refreshTrigger}
            className={`h-full w-full ${tileProvider === 'dark' ? 'dark-leaflet-map' : ''}`}
          />

          {/* In-Map Floating Status Legend */}
          <div className="absolute top-3 right-3 z-[400] p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-300 backdrop-blur-md shadow-xl space-y-1.5 pointer-events-none hidden sm:block">
            <div className="font-bold text-[10px] uppercase text-slate-400 tracking-wider mb-1">MAP LEGEND</div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span>Active CCTV Camera</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
              <span>Offline CCTV Camera</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50 animate-pulse" />
              <span>Road Accident Alert</span>
            </div>
            {pickedLocation && (
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
                <span>Selected Pinpoint</span>
              </div>
            )}
          </div>

          {/* Empty Mapped Markers Alert */}
          {mappedMarkers.length === 0 && !loading && (
            <div className="absolute inset-0 z-[300] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-none">
              <div className="max-w-md text-center p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl pointer-events-auto">
                <MapPin className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-white mb-1">No Assets with GPS Coordinates</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Surveillance cameras or recorded incident footage in the system currently lack geographical latitude/longitude metadata.
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAssetFilter('unmapped');
                    }}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/40 cursor-pointer"
                  >
                    View Unmapped Assets
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPickingMode(true)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                  >
                    Pick Coordinates
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Sidebar / Directory / Location Details */}
        <div className="w-full lg:w-96 shrink-0 h-full flex flex-col">
          {selectedMarker ? (
            /* Selected Asset Detailed View */
            <LocationDetailsView
              item={selectedMarker}
              onClose={() => setSelectedMarker(null)}
              onActionClick={handleActionClick}
              onAssignCoordinates={() => {
                setIsPickingMode(true);
              }}
            />
          ) : (
            /* Asset Directory List */
            <div className="flex flex-col h-full rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-xl">
              {/* Directory Header */}
              <div className="p-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200 font-mono">
                    ASSET DIRECTORY
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Showing {filteredMarkers.length} of {mapData.markers.length} items
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === 'all' ? 'active' : 'all')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase transition-colors cursor-pointer ${
                      statusFilter === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {statusFilter === 'active' ? 'Active Only' : 'Filter Status'}
                  </button>
                </div>
              </div>

              {/* Asset List */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
                {filteredMarkers.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center p-4">
                    <Search className="w-6 h-6 text-slate-600 mb-2" />
                    <span className="text-xs text-slate-400 font-medium">No assets matching criteria</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setAssetFilter('all');
                        setStatusFilter('all');
                      }}
                      className="mt-2 text-[11px] text-blue-400 hover:underline cursor-pointer"
                    >
                      Clear search filters
                    </button>
                  </div>
                ) : (
                  filteredMarkers.map((item) => {
                    const isIncident = item.type === 'incident';
                    const hasCoordinates = item.hasCoordinates && item.latitude != null && item.longitude != null;
                    const isActive = item.status?.toLowerCase() === 'active' || item.status?.toLowerCase() === 'connected' || item.status?.toLowerCase() === 'processing';

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleMarkerSelect(item)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                          hasCoordinates
                            ? 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800/80 hover:border-slate-700'
                            : 'bg-amber-950/10 hover:bg-amber-950/20 border-amber-500/20 hover:border-amber-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`p-1.5 rounded-lg shrink-0 ${
                              isIncident
                                ? 'bg-red-500/20 text-red-400'
                                : isActive
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-slate-800 text-slate-400'
                            }`}>
                              {isIncident ? <AlertTriangle className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                            </div>
                            <span className="font-semibold text-xs text-white truncate group-hover:text-amber-400 transition-colors">
                              {item.title}
                            </span>
                          </div>

                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : isIncident
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-slate-800 text-slate-400'
                          }`}>
                            {item.status || 'Active'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-2">
                          <span className="truncate max-w-[180px]">{item.subtitle || item.id}</span>
                          {hasCoordinates ? (
                            <span className="text-emerald-400 font-medium flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-emerald-400" />
                              <span>{item.latitude!.toFixed(3)}, {item.longitude!.toFixed(3)}</span>
                            </span>
                          ) : (
                            <span className="text-amber-400/90 text-[10px] font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              No GPS
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LocationMap;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type MarkerType = 'camera' | 'incident' | 'traffic-aid' | 'custom' | 'pin';

export interface MapMarkerItem {
  id: string;
  rawId?: string;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates?: boolean;
  title: string;
  type?: MarkerType;
  status?: string;
  subtitle?: string;
  severity?: string;
  info?: Record<string, any>;
}

export interface MapComponentProps {
  /** Callback fired when user clicks anywhere on the map to pick/select coordinates */
  onLocationSelect?: (latlng: LatLng) => void;
  /** Primary single marker position (for backward compatibility with Nirikshan MapComponent) */
  marker?: Coordinates | null;
  /** Collection of multiple markers (cameras, incidents, aid posts) */
  markers?: MapMarkerItem[];
  /** Callback when an existing marker is selected */
  onMarkerSelect?: (marker: MapMarkerItem) => void;
  /** Center point for map view; defaults to Pune-Mumbai expressway corridor [18.75, 73.4] from Nirikshan */
  center?: [number, number];
  /** Initial zoom level; defaults to 10 */
  initialZoom?: number;
  /** Whether user can interactively pan/zoom */
  interactive?: boolean;
  /** Optional custom CSS class */
  className?: string;
  /** Map tile URL template (defaults to OpenStreetMap) */
  tileLayerUrl?: string;
  /** Attribution notice for the tile layer */
  tileAttribution?: string;
  /** Force map size invalidation / reload */
  refreshTrigger?: any;
}

export interface MapLocationViewProps {
  latitude?: number | null;
  longitude?: number | null;
  incidentName?: string;
  className?: string;
  emptyStateText?: string;
  showCoordinatesBadge?: boolean;
}

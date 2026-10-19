import React from 'react';
import { MapPin } from 'lucide-react';
import { MapComponent } from './MapComponent';
import type { MapLocationViewProps } from './types';

/**
 * MapLocationView extracted and adapted from Nirikshan (incident-verification/MapLocationView.tsx).
 * Handles:
 * 1. Safe coordinate validation
 * 2. Fallback empty state ("Location data unavailable") with MapPin icon
 * 3. Exact coordinates badge overlay
 * 4. Rendering interactive or static map pin
 */
export const MapLocationView: React.FC<MapLocationViewProps> = ({
  latitude,
  longitude,
  incidentName = 'Incident Location',
  className = '',
  emptyStateText = 'Location data unavailable',
  showCoordinatesBadge = true,
}) => {
  // If coordinates are invalid or missing
  if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/60 p-6 text-center ${className}`}
      >
        <MapPin className="mb-2 h-7 w-7 text-slate-500" />
        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{emptyStateText}</p>
        <p className="mt-1 text-[11px] text-slate-500 font-mono">No GPS telemetry coordinates configured</p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 ${className}`}>
      <MapComponent
        marker={{ latitude, longitude }}
        markers={[
          {
            id: 'incident-pin',
            latitude,
            longitude,
            title: incidentName,
            type: 'incident',
            status: 'Active'
          }
        ]}
        center={[latitude, longitude]}
        initialZoom={14}
        interactive={true}
        className="h-full min-h-[200px] w-full"
      />

      {showCoordinatesBadge && (
        <div className="absolute bottom-2 right-2 z-[400] rounded-md bg-slate-950/85 px-2.5 py-1 font-mono text-[11px] text-white border border-slate-700/80 backdrop-blur-sm pointer-events-none shadow-md">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </div>
      )}
    </div>
  );
};

export default MapLocationView;

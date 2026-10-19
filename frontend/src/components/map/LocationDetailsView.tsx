import React from 'react';
import { MapPin, Video, Eye, AlertTriangle, Copy, ExternalLink, X, Check } from 'lucide-react';
import { MapComponent } from './MapComponent';
import type { MapMarkerItem } from './types';

export interface LocationDetailsViewProps {
  item: MapMarkerItem | null;
  onClose?: () => void;
  onActionClick?: (item: MapMarkerItem) => void;
  actionLabel?: string;
  onAssignCoordinates?: (item: MapMarkerItem) => void;
}

/**
 * Reusable location detail panel adapted from Nirikshan CCTVviewDetails & TrafficAidPostViewDetails.
 * Displays details alongside a synchronized Leaflet location view.
 */
export const LocationDetailsView: React.FC<LocationDetailsViewProps> = ({
  item,
  onClose,
  onActionClick,
  actionLabel,
  onAssignCoordinates
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!item) return null;

  const hasCoords = item.latitude != null && item.longitude != null && !isNaN(item.latitude) && !isNaN(item.longitude);
  const isIncident = item.type === 'incident';

  const defaultActionLabel = isIncident ? 'View Incident Forensics' : 'Inspect Live Stream';
  const effectiveActionLabel = actionLabel || defaultActionLabel;

  const copyCoords = () => {
    if (hasCoords && item.latitude != null && item.longitude != null) {
      navigator.clipboard.writeText(`${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl text-slate-100 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-2 rounded-xl shrink-0 ${isIncident ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
            {isIncident ? <AlertTriangle className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-white truncate">{item.title}</h3>
            <p className="text-[11px] text-slate-400 font-mono truncate">{item.subtitle || `ID: ${item.id}`}</p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close details"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body with mini-map and metadata */}
      <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
        {/* Status tag */}
        <div className="flex items-center justify-between text-xs bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-slate-400 font-mono text-[11px]">TELEMETRY STATUS</span>
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
            item.status?.toLowerCase() === 'active' || item.status?.toLowerCase() === 'connected' || item.status?.toLowerCase() === 'processing'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : isIncident
                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            {item.status || 'Active'}
          </span>
        </div>

        {/* Geographic Map Section */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>COORDINATES</span>
            </span>
            {hasCoords ? (
              <button
                type="button"
                onClick={copyCoords}
                className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-2 py-0.5 rounded transition-colors cursor-pointer"
                title="Copy coordinates"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                <span>{item.latitude!.toFixed(4)}, {item.longitude!.toFixed(4)}</span>
              </button>
            ) : (
              <span className="text-amber-400 font-semibold">NOT CONFIGURED</span>
            )}
          </div>

          <div className="h-44 w-full rounded-xl overflow-hidden border border-slate-800 relative bg-slate-950">
            {hasCoords && item.latitude != null && item.longitude != null ? (
              <MapComponent
                center={[item.latitude, item.longitude]}
                marker={{ latitude: item.latitude, longitude: item.longitude }}
                initialZoom={14}
                interactive={true}
                className="h-full w-full"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-4 text-center bg-slate-950/80">
                <MapPin className="w-6 h-6 text-slate-600 mb-1" />
                <span className="text-xs text-slate-400 font-medium">GPS Telemetry Missing</span>
                <span className="text-[10px] text-slate-500 font-mono mt-0.5">This asset does not yet have geographical coordinates</span>
                {onAssignCoordinates && (
                  <button
                    type="button"
                    onClick={() => onAssignCoordinates(item)}
                    className="mt-2.5 px-3 py-1 rounded-lg text-[11px] font-semibold bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 transition-colors cursor-pointer"
                  >
                    Set GPS on Map
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Additional information */}
        {item.info && (
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80 text-xs">
            <div className="text-[10px] uppercase font-mono font-semibold text-slate-400 tracking-wider mb-1">
              Metadata & Attributes
            </div>
            {Object.entries(item.info).map(([key, val]) => {
              if (val === undefined || val === null || val === '') return null;
              return (
                <div key={key} className="flex justify-between items-center py-1 border-b border-slate-800/40">
                  <span className="text-slate-400 capitalize text-[11px]">
                    {key.replace(/([A-Z])/g, ' $1')}
                  </span>
                  <span className="text-slate-200 font-mono text-[11px] font-medium max-w-[190px] truncate">
                    {String(val)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer action button */}
      {onActionClick && (
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/60">
          <button
            type="button"
            onClick={() => onActionClick(item)}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isIncident ? <AlertTriangle className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{effectiveActionLabel}</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </button>
        </div>
      )}
    </div>
  );
};

export default LocationDetailsView;

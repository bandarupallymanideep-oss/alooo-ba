import React from 'react';
import { Search, Camera as CameraIcon, AlertCircle, MapPin, Calendar, Tag } from 'lucide-react';
import type { AccidentCategory, Camera, AlertFilterOptions } from '../api/types';

interface AlertFilterBarProps {
  filters: AlertFilterOptions;
  onChange: (newFilters: AlertFilterOptions) => void;
  cameras: Camera[];
  categories?: AccidentCategory[];
  categoryCounts?: Record<string, number>;
  availableLocations?: string[];
  totalRecordsCount: number;
}

export const AlertFilterBar: React.FC<AlertFilterBarProps> = ({
  filters,
  onChange,
  cameras,
  categories = [],
  categoryCounts = {},
  availableLocations = [],
  totalRecordsCount
}) => {
  // Extract unique locations from cameras and provided list
  const uniqueLocations = Array.from(new Set([
    ...availableLocations,
    ...cameras.map(c => c.location)
  ])).filter(Boolean);

  const hasActiveFilters = Boolean(
    filters.search || 
    filters.status || 
    filters.cameraId || 
    filters.category || 
    filters.location || 
    filters.severity || 
    (filters.dateRange && filters.dateRange !== 'all')
  );

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 backdrop-blur-md space-y-3">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Box */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Search by accident ID (e.g. accident0), location, camera or category..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-xl text-xs text-white placeholder-slate-500 outline-none transition-all font-sans"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono shrink-0 overflow-x-auto">
          {(['all', 'New', 'Acknowledged', 'Resolved'] as const).map((status) => {
            const isSelected = (filters.status || 'all').toLowerCase() === status.toLowerCase();
            return (
              <button
                key={status}
                type="button"
                onClick={() => onChange({ ...filters, status: status === 'all' ? undefined : status })}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer capitalize font-semibold whitespace-nowrap ${
                  isSelected
                    ? status === 'New'
                      ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                      : status === 'Acknowledged'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                      : status === 'Resolved'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {status === 'all' ? `All (${totalRecordsCount})` : status}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category chips: the four specified categories first, then other classes the model detects */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60 text-xs">
          <span className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] mr-1">
            <Tag className="w-3.5 h-3.5 text-red-400" /> CATEGORY:
          </span>
          {[{ id: 'all', label: 'ALL', supported: true, required: true, yoloClasses: [] as string[] }, ...categories].map(cat => {
            const selected = (filters.category || 'all') === cat.id;
            const count = cat.id === 'all' ? totalRecordsCount : categoryCounts[cat.id] || 0;
            const label = cat.id === 'all' ? 'All' : cat.label.replace(' ACCIDENT', '').replace('–', ' + ');
            return (
              <button
                key={cat.id}
                type="button"
                disabled={!cat.supported}
                onClick={() => onChange({ ...filters, category: cat.id === 'all' ? undefined : cat.id })}
                title={
                  cat.supported
                    ? `${cat.label}${cat.yoloClasses.length ? ` (YOLO class: ${cat.yoloClasses.join(', ')})` : ''}`
                    : `${cat.label}: not detectable by the current YOLO11 model (it has no truck class). Supported automatically when a model with this class is deployed.`
                }
                className={`px-2.5 py-1 rounded-full border font-mono text-[11px] transition-all ${
                  !cat.supported
                    ? 'border-dashed border-slate-700 text-slate-500 cursor-not-allowed'
                    : selected
                    ? 'bg-red-600 border-red-600 text-white shadow-md shadow-red-600/25 cursor-pointer'
                    : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white cursor-pointer'
                }`}
              >
                {label}
                {cat.supported ? <span className="ml-1.5 opacity-70">{count}</span> : <span className="ml-1.5">· N/A</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Secondary Row: Camera, Location, Date Range, Severity Filters */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/60 text-xs">
        {/* Camera Selector Dropdown */}
        <div className="flex items-center gap-1.5">
          <CameraIcon className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-400 font-mono text-[11px]">CAMERA:</span>
          <select
            value={filters.cameraId || 'all'}
            onChange={(e) => onChange({ ...filters, cameraId: e.target.value === 'all' ? undefined : e.target.value })}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-slate-700 cursor-pointer max-w-[150px] truncate"
          >
            <option value="all">All Cameras ({cameras.length})</option>
            {cameras.map(cam => (
              <option key={cam.id} value={cam.id}>
                {cam.name}
              </option>
            ))}
          </select>
        </div>

        {/* Location Selector Dropdown */}
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-red-400" />
          <span className="text-slate-400 font-mono text-[11px]">LOCATION:</span>
          <select
            value={filters.location || 'all'}
            onChange={(e) => onChange({ ...filters, location: e.target.value === 'all' ? undefined : e.target.value })}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-slate-700 cursor-pointer max-w-[180px] truncate"
          >
            <option value="all">All Locations</option>
            {uniqueLocations.map(loc => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range Selector Dropdown */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400 font-mono text-[11px]">DATE RANGE:</span>
          <select
            value={filters.dateRange || 'all'}
            onChange={(e) => onChange({ ...filters, dateRange: e.target.value as any })}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-slate-700 cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today (Past 24h)</option>
            <option value="week">Past 7 Days</option>
            <option value="month">Past 30 Days</option>
          </select>
        </div>

        {/* Severity Selector Dropdown */}
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-slate-400 font-mono text-[11px]">SEVERITY:</span>
          <select
            value={filters.severity || 'all'}
            onChange={(e) => onChange({ ...filters, severity: e.target.value === 'all' ? undefined : e.target.value })}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-slate-700 cursor-pointer"
          >
            <option value="all">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Minor">Minor</option>
          </select>
        </div>

        {/* Reset Filter action */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="ml-auto text-[11px] font-mono text-red-400 hover:text-red-300 underline cursor-pointer"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
};


import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  AlertTriangle, 
  ShieldCheck, 
  Zap, 
  Volume2, 
  VolumeX, 
  Cpu, 
  Activity,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { useAlerts } from '../context/AlertsContext';
import { useCameras } from '../context/CameraContext';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen = false,
  onClose,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { newAlertsCount, soundEnabled, setSoundEnabled } = useAlerts();
  const { cameras, backendOnline, health } = useCameras();
  const activeDetections = cameras.filter(c => c.detection?.active);
  const activeSessions = activeDetections.length;
  const inferring = activeDetections.filter(c => (c.detection?.inferenceMs || 0) > 0);
  const avgInferenceMs = inferring.length
    ? Math.round(inferring.reduce((sum, c) => sum + (c.detection?.inferenceMs || 0), 0) / inferring.length)
    : null;

  const navItems = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Cameras & Statistics'
    },
    {
      to: '/live',
      label: 'Live Monitor',
      icon: Video,
      description: 'RTSP / Video Detection'
    },
    {
      to: '/alerts',
      label: 'Alerts & Violations',
      icon: AlertTriangle,
      description: 'Saved Accident Footage',
      badge: newAlertsCount
    }
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden transition-opacity"
        />
      )}

      <aside className={`
        force-dark fixed lg:static top-0 bottom-0 left-0 z-50
        bg-[#111a28] border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-screen select-none backdrop-blur-xl transition-all duration-300
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
        ${!isOpen && isCollapsed ? 'lg:w-20' : 'lg:w-64'}
      `}>
        {/* Top Header / Brand */}
        <div>
          <div className={`p-4 border-b border-slate-800/80 flex items-center ${isCollapsed && !isOpen ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-3">
              <BrandLogo size={42} />
              {(!isCollapsed || isOpen) && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-white text-base tracking-tight font-sans">
                      SADARAKSHAK
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium truncate">Road Accident Detection</p>
                </div>
              )}
            </div>

            {/* Mobile close button */}
            {isOpen && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* Desktop collapse toggle */}
            {!isOpen && onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className={`hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors ${
                  isCollapsed ? 'mt-2' : ''
                }`}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <div className="px-3 py-4">
            {(!isCollapsed || isOpen) && (
              <div className="text-[10px] uppercase font-mono font-semibold text-slate-400 px-3 mb-2 tracking-wider">
                Command Center
              </div>
            )}
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => {
                      if (isOpen && onClose) onClose();
                    }}
                    title={isCollapsed && !isOpen ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center ${isCollapsed && !isOpen ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'} rounded-xl transition-all duration-200 group relative ${
                        isActive
                          ? 'bg-gradient-to-r from-red-600/20 to-amber-600/10 text-white border border-red-500/40 shadow-lg shadow-red-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className={`flex items-center ${isCollapsed && !isOpen ? 'justify-center' : 'gap-3'} min-w-0`}>
                          <div
                            className={`p-1.5 rounded-lg transition-colors relative ${
                              isActive
                                ? 'bg-red-500 text-white shadow-md shadow-red-500/30'
                                : 'bg-slate-800/80 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-800'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {/* Dot badge on icon if collapsed */}
                            {isCollapsed && !isOpen && typeof item.badge === 'number' && item.badge > 0 && (
                              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full border border-slate-950 animate-pulse" />
                            )}
                          </div>
                          {(!isCollapsed || isOpen) && (
                            <div className="truncate">
                              <div className={`text-sm font-medium ${isActive ? 'text-white font-semibold' : ''}`}>
                                {item.label}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {item.description}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Dynamic full badge for alerts */}
                        {(!isCollapsed || isOpen) && typeof item.badge === 'number' && item.badge > 0 && (
                          <span className="flex items-center justify-center px-2 py-0.5 text-xs font-mono font-bold text-white bg-red-600 rounded-full shadow-md shadow-red-600/40 animate-pulse">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Detection engine status (real backend) */}
          {(!isCollapsed || isOpen) && (
            <div className="px-3 py-2">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-inner space-y-1.5 text-[11px] font-mono">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <Zap className="w-3.5 h-3.5" />
                  <span>DETECTION ENGINE</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Model</span>
                  <span className="text-slate-200">{health ? 'YOLO11m' : '--'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Device</span>
                  <span className="text-slate-200 uppercase">{health?.model.device ?? '--'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Active detections</span>
                  <span className="text-slate-200">{activeSessions}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Telemetry & Controls */}
        <div className="p-3 border-t border-slate-800/80 space-y-3">
          {(!isCollapsed || isOpen) ? (
            <>
              {/* System telemetry status */}
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Backend</span>
                  </span>
                  {backendOnline === false ? (
                    <span className="text-red-400 font-bold">OFFLINE</span>
                  ) : (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                      {backendOnline ? 'ONLINE' : '...'}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    <span>YOLO Latency</span>
                  </span>
                  <span className="text-slate-300">{avgInferenceMs != null ? `${avgInferenceMs} ms` : 'idle'}</span>
                </div>
              </div>

              {/* Audio Alert Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>Alarm Chime</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    soundEnabled
                      ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
                  }`}
                  title={soundEnabled ? 'Mute incident audio chime' : 'Enable incident audio chime'}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                  soundEnabled
                    ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
                }`}
                title={soundEnabled ? 'Mute alarm chime' : 'Enable alarm chime'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

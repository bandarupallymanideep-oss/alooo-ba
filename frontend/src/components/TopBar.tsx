import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Clock, Shield, Video, Bell, ChevronDown, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertsContext';
import { useCameras } from '../context/CameraContext';
import { ThemeToggle } from './ThemeToggle';

interface TopBarProps {
  onToggleSidebar?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const { newAlertsCount } = useAlerts();
  const { backendOnline } = useCameras();
  const navigate = useNavigate();
  const location = useLocation();

  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentUtc, setCurrentUtc] = useState<string>('');
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
      setCurrentUtc(now.toUTCString().slice(17, 25) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Title based on path
  const getPageTitle = () => {
    if (location.pathname.startsWith('/dashboard')) return 'SADARAKSHAK Dashboard';
    if (location.pathname.startsWith('/live')) return 'Live Monitor & Accident Detection';
    if (location.pathname.startsWith('/alerts')) return 'Alerts & Accident Footage';
    return 'SADARAKSHAK';
  };

  return (
    <header className="h-16 bg-slate-950/70 border-b border-slate-800/80 px-6 flex items-center justify-between backdrop-blur-xl shrink-0 z-30 select-none">
      {/* Left: Active Section breadcrumb */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 lg:hidden cursor-pointer"
            title="Toggle Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <h1 className="text-base font-bold text-white tracking-tight font-sans">
            {getPageTitle()}
          </h1>
        </div>
        <span className="hidden md:inline text-slate-600">/</span>
        {backendOnline === false ? (
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            BACKEND OFFLINE
          </span>
        ) : (
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            SYSTEM LIVE
          </span>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Live Clock HUD */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800/80 text-xs font-mono text-slate-300">
          <Clock className="w-3.5 h-3.5 text-red-400" />
          <span className="text-white font-semibold">{currentTime}</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">{currentUtc}</span>
        </div>

        <ThemeToggle />

        {/* Quick link to live detection */}
        <button
          type="button"
          onClick={() => navigate('/live')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 text-xs font-semibold font-mono transition-all cursor-pointer shadow-sm active:scale-95"
          title="Open the live monitor"
        >
          <Video className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Live Monitor</span>
        </button>

        {/* Alerts quick button */}
        <button
          type="button"
          onClick={() => navigate('/alerts')}
          className="relative p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="View active alerts"
        >
          <Bell className="w-4 h-4" />
          {newAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white font-mono text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {newAlertsCount}
            </span>
          )}
        </button>

        {/* User Profile & Logout */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center font-bold text-xs text-white overflow-hidden border border-slate-600">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <Shield className="w-4 h-4 text-slate-300" />
              )}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-semibold text-slate-200 leading-tight">
                {user?.name || 'Operator'}
              </div>
              <div className="text-[10px] text-slate-300 font-mono">
                {user?.role || 'Controller'}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Profile Dropdown Menu */}
          {profileOpen && (
            <div 
              className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 z-50 animate-menu-in"
              onMouseLeave={() => setProfileOpen(false)}
            >
              <div className="px-4 py-2 border-b border-slate-800">
                <p className="text-xs font-semibold text-white">{user?.name}</p>
                <p className="text-[11px] text-slate-400 font-mono truncate">{user?.email}</p>
              </div>

              <div className="pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer text-left font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect / Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

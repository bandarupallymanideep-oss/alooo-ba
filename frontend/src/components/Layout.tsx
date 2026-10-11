import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertsContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Toast } from './Toast';
import { BrandLogo } from './BrandLogo';

export const Layout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { recentAlert, dismissRecentAlert } = useAlerts();

  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center text-slate-300 font-mono text-sm">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo size={64} className="animate-pulse" />
          <span>INITIALIZING SADARAKSHAK CONTROL ROOM...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden app-bg text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar 
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)} />
        
        {/* Scrollable page view */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          {/* keyed on the path: each page fades in on navigation (same tab, no reload) */}
          <div key={location.pathname} className="animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Real-time Incident Detection Toast */}
      <Toast alert={recentAlert} onDismiss={dismissRecentAlert} />
    </div>
  );
};


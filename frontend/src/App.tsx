import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CameraProvider } from './context/CameraContext';
import { AlertsProvider } from './context/AlertsContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { LiveMonitor } from './pages/LiveMonitor';
import { Alerts } from './pages/Alerts';
import { AlertDetail } from './pages/AlertDetail';
import { LocationMap } from './pages/LocationMap';
import { DownloadApp } from './pages/DownloadApp';
import { isDesktopApp } from './utils/runtime';

export const App: React.FC = () => {
  const isDesktop = isDesktopApp();
  const RouterComponent = isDesktop ? HashRouter : BrowserRouter;

  return (
    <ThemeProvider>
      <RouterComponent>
        <AuthProvider>
          <CameraProvider>
            <AlertsProvider>
              <Routes>
                {/* Public route */}
                <Route path="/login" element={<Login />} />

                {/* Protected Control Room routes */}
                <Route path="/" element={<Layout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="live" element={<LiveMonitor />} />
                  <Route path="map" element={<LocationMap />} />
                  <Route path="alerts" element={<Alerts />} />
                  <Route path="alerts/:id" element={<AlertDetail />} />

                  {/* Windows desktop app download section: Website only. Inside desktop app, redirect to dashboard. */}
                  <Route
                    path="download"
                    element={isDesktop ? <Navigate to="/dashboard" replace /> : <DownloadApp />}
                  />

                  {/* System diagnostics route: removed from user-facing navigation, redirect to dashboard */}
                  <Route path="diagnostics" element={<Navigate to="/dashboard" replace />} />
                </Route>

                {/* Catch-all redirect */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AlertsProvider>
          </CameraProvider>
        </AuthProvider>
      </RouterComponent>
    </ThemeProvider>
  );
};

export default App;

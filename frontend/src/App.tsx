import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

export const App: React.FC = () => {
  return (
    <ThemeProvider>
    <BrowserRouter>
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
                <Route path="alerts" element={<Alerts />} />
                <Route path="alerts/:id" element={<AlertDetail />} />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AlertsProvider>
        </CameraProvider>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;

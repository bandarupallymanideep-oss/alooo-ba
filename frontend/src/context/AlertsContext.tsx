import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { AccidentCategory, AccidentRecord, AlertFilterOptions, DashboardStats } from '../api/types';
import { getAlerts, updateAlertStatus, computeStats, filterAlerts, deleteAlert, getAccidentCategories } from '../api/alerts';
import { audioAlarm } from '../utils/audioAlarm';
import { useCameras } from './CameraContext';
import { useAuth } from './AuthContext';

const POLL_MS = 3000;

interface AlertsContextType {
  alerts: AccidentRecord[];
  stats: DashboardStats | null;
  newAlertsCount: number;
  recentAlert: AccidentRecord | null;
  flashingCameraIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  fetchFilteredAlerts: (filters?: AlertFilterOptions) => Promise<AccidentRecord[]>;
  refreshAlerts: () => Promise<void>;
  markAcknowledged: (id: string, notes?: string) => Promise<AccidentRecord>;
  markResolved: (id: string, notes?: string) => Promise<AccidentRecord>;
  saveNotes: (id: string, notes: string) => Promise<AccidentRecord>;
  removeAlert: (id: string) => Promise<void>;
  categories: AccidentCategory[];
  dismissRecentAlert: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
}

const AlertsContext = createContext<AlertsContextType | undefined>(undefined);

/**
 * Accident alerts come from the backend (/api/accidents = files in backend/detected_accidents).
 * The list is polled; any accident id not seen before raises the toast, alarm and tile flash.
 */
export const AlertsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { cameras } = useCameras();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AccidentRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [recentAlert, setRecentAlert] = useState<AccidentRecord | null>(null);
  const [flashingCameraIds, setFlashingCameraIds] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const knownIds = useRef<Set<string> | null>(null);
  const [categories, setCategories] = useState<AccidentCategory[]>([]);

  useEffect(() => {
    getAccidentCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const announce = useCallback((record: AccidentRecord) => {
    setRecentAlert(record);
    audioAlarm.playIncidentAlert();
    setFlashingCameraIds(prev => new Set(prev).add(record.cameraId));
    setTimeout(() => {
      setFlashingCameraIds(prev => {
        const updated = new Set(prev);
        updated.delete(record.cameraId);
        return updated;
      });
    }, 12000);
  }, []);

  const refreshAlerts = useCallback(async () => {
    try {
      const data = await getAlerts();
      setAlerts(data);
      setError(null);
      if (knownIds.current === null) {
        knownIds.current = new Set(data.map(a => a.id)); // first load: no alarm for old records
      } else {
        const fresh = data.filter(a => !knownIds.current!.has(a.id));
        fresh.forEach(a => knownIds.current!.add(a.id));
        if (fresh.length > 0) announce(fresh[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch accident alerts');
    } finally {
      setIsLoading(false);
    }
  }, [announce]);

  useEffect(() => {
    refreshAlerts();
    const timer = setInterval(refreshAlerts, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshAlerts]);

  const setSoundEnabled = (enabled: boolean) => {
    setSoundEnabledState(enabled);
    audioAlarm.setSoundEnabled(enabled);
  };

  const replace = (updated: AccidentRecord) => setAlerts(prev => prev.map(a => (a.id === updated.id ? updated : a)));
  const operator = user?.name || 'Operator';

  const markAcknowledged = async (id: string, notes?: string) => {
    const updated = await updateAlertStatus(id, 'Acknowledged', operator, notes);
    replace(updated);
    return updated;
  };

  const markResolved = async (id: string, notes?: string) => {
    const updated = await updateAlertStatus(id, 'Resolved', operator, notes);
    replace(updated);
    return updated;
  };

  const saveNotes = async (id: string, notes: string) => {
    const updated = await updateAlertStatus(id, undefined, operator, notes);
    replace(updated);
    return updated;
  };

  const removeAlert = async (id: string) => {
    await deleteAlert(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    setRecentAlert(prev => (prev?.id === id ? null : prev));
  };

  const fetchFilteredAlerts = async (filters?: AlertFilterOptions) => filterAlerts(alerts, filters);
  const dismissRecentAlert = useCallback(() => setRecentAlert(null), []);

  const stats = useMemo(() => computeStats(cameras, alerts), [cameras, alerts]);
  const newAlertsCount = alerts.filter(a => a.status === 'New').length;

  return (
    <AlertsContext.Provider
      value={{
        alerts,
        stats,
        newAlertsCount,
        recentAlert,
        flashingCameraIds,
        isLoading,
        error,
        fetchFilteredAlerts,
        refreshAlerts,
        markAcknowledged,
        markResolved,
        saveNotes,
        removeAlert,
        categories,
        dismissRecentAlert,
        soundEnabled,
        setSoundEnabled,
      }}
    >
      {children}
    </AlertsContext.Provider>
  );
};

export const useAlerts = (): AlertsContextType => {
  const context = useContext(AlertsContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertsProvider');
  }
  return context;
};

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { BackendHealth, Camera, CameraInput, CameraStatus } from '../api/types';
import {
  getCameras,
  createCamera,
  updateCamera,
  deleteCamera,
  toggleCameraStatus,
  startDetection as apiStartDetection,
  stopDetection as apiStopDetection,
  getHealth,
} from '../api/cameras';
import type { SaveCameraResult } from '../api/cameras';

const POLL_MS = 2000;

interface CameraContextType {
  cameras: Camera[];
  isLoading: boolean;
  error: string | null;
  backendOnline: boolean | null;
  health: BackendHealth | null;
  refreshCameras: () => Promise<void>;
  addCamera: (data: CameraInput) => Promise<SaveCameraResult>;
  editCamera: (id: string, updates: Partial<CameraInput>) => Promise<SaveCameraResult>;
  removeCamera: (id: string) => Promise<void>;
  changeStatus: (id: string, status: CameraStatus) => Promise<Camera>;
  startDetection: (id: string) => Promise<Camera>;
  stopDetection: (id: string) => Promise<Camera>;
}

const CameraContext = createContext<CameraContextType | undefined>(undefined);

export const CameraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const inFlight = useRef(false);

  const refreshCameras = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await getCameras();
      setCameras(data);
      setError(null);
      setBackendOnline(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to load camera sources');
      setBackendOnline(false);
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCameras();
    const timer = setInterval(refreshCameras, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCameras]);

  useEffect(() => {
    if (!backendOnline) return;
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, [backendOnline]);

  const upsert = (cam: Camera) =>
    setCameras(prev => (prev.some(c => c.id === cam.id) ? prev.map(c => (c.id === cam.id ? cam : c)) : [...prev, cam]));

  const addCamera = async (data: CameraInput) => {
    const res = await createCamera(data);
    upsert(res.camera);
    return res;
  };

  const editCamera = async (id: string, updates: Partial<CameraInput>) => {
    const res = await updateCamera(id, updates);
    upsert(res.camera);
    return res;
  };

  const removeCamera = async (id: string): Promise<void> => {
    await deleteCamera(id);
    setCameras(prev => prev.filter(c => c.id !== id));
  };

  const changeStatus = async (id: string, status: CameraStatus): Promise<Camera> => {
    const updated = await toggleCameraStatus(id, status);
    upsert(updated);
    return updated;
  };

  const startDetection = async (id: string) => {
    try {
      const cam = await apiStartDetection(id);
      upsert(cam);
      return cam;
    } finally {
      refreshCameras();
    }
  };

  const stopDetection = async (id: string) => {
    const cam = await apiStopDetection(id);
    upsert(cam);
    return cam;
  };

  return (
    <CameraContext.Provider
      value={{
        cameras,
        isLoading,
        error,
        backendOnline,
        health,
        refreshCameras,
        addCamera,
        editCamera,
        removeCamera,
        changeStatus,
        startDetection,
        stopDetection,
      }}
    >
      {children}
    </CameraContext.Provider>
  );
};

export const useCameras = (): CameraContextType => {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error('useCameras must be used within a CameraProvider');
  }
  return context;
};

import { apiRequest } from './client';

export interface SystemHardware {
  os: string;
  platform: string;
  cpu: {
    name: string;
    logicalCores: number;
    physicalCores: number;
    usagePercent: number;
  };
  ram: {
    totalGb: number;
    availableGb: number;
    usedGb: number;
    usagePercent: number;
  };
  gpu: {
    name: string;
    vramBytes: number;
    vramGb: number | null;
    driverVersion: string;
    allGpus: Array<{
      name: string;
      adapterRamBytes: number;
      driverVersion: string;
    }>;
    cuda: {
      supported: boolean;
      deviceCount: number;
      deviceName: string | null;
    };
    openvinoDevices: Array<{
      device: string;
      fullName: string;
    }>;
  };
}

export interface AiDiagnostics {
  modelFile: string;
  engine: string;
  device: string;
  deviceIndicator: string;
  deviceLabel: string;
  isGpuAccelerated: boolean;
  warmupMs: number;
  classesCount: number;
  classes: Record<string, string>;
  confidenceThreshold: number;
  currentInferenceMs: number | null;
  currentInferenceFps: number | null;
}

export interface PerformanceMetrics {
  inferenceLatencyMs: number | null;
  processingLatencyMs: number | null;
  deliveryLatencyMs: number | null;
  detectionLatencyMs: number | null;
  videoProcessingFps: number | null;
  cpuUtilization: number;
  ramUtilization: number;
  activeStreams: number;
  totalSessions: number;
  frameErrors: number;
  reconnectAttempts: number;
}

export interface StreamDiagnostics {
  activeCount: number;
  sessions: any[];
}

export interface BackendDiagnostics {
  status: string;
  uptimeSeconds: number;
  modelLoaded: boolean;
  accidentsSaved: number;
  detectedAccidentsDir: string;
}

export interface DiagnosticsResponse {
  timestamp: number;
  system: SystemHardware;
  ai: AiDiagnostics;
  performance: PerformanceMetrics;
  streamDiagnostics: StreamDiagnostics;
  backend: BackendDiagnostics;
}

export interface DownloadArtifact {
  filename: string;
  type: 'installer' | 'portable';
  sizeBytes: number;
  sizeMb: number;
  url: string;
  updatedAt: string;
}

export interface DownloadsInfoResponse {
  version: string;
  name: string;
  supportedOs: string;
  requirements: {
    os: string;
    cpu: string;
    ram: string;
    gpu: string;
    storage: string;
  };
  downloads: DownloadArtifact[];
  installerName: string;
  portableName: string;
}

export async function fetchSystemDiagnostics(): Promise<DiagnosticsResponse> {
  return apiRequest<DiagnosticsResponse>('/api/system/diagnostics', { timeoutMs: 10000 });
}

export async function fetchDownloadsInfo(): Promise<DownloadsInfoResponse> {
  return apiRequest<DownloadsInfoResponse>('/api/downloads/info', { timeoutMs: 5000 });
}

export interface GpuDetectionResponse {
  success: boolean;
  result:
    | 'GPU Acceleration Available'
    | 'GPU Detected — Acceleration Not Supported'
    | 'GPU Detected'
    | 'No GPU Detected'
    | 'Detection Failed';
  gpuDetected: boolean;
  accelerationSupported: boolean;
  accelerationType: 'CUDA' | 'OPENVINO' | 'NONE';
  gpu?: {
    name: string;
    manufacturer: string;
    adapterRamBytes: number;
    adapterRamGb: number | null;
    memoryDisplay: string;
    driverVersion: string;
    status: string;
    isIntel: boolean;
    isNvidia: boolean;
    isAmd?: boolean;
  } | null;
  allGpus?: any[];
  cuda?: {
    torchVersion?: string;
    torchCudaSupported?: boolean;
    isAvailable?: boolean;
    isOperational?: boolean;
    deviceName?: string | null;
    failureReason?: string | null;
  };
  inferenceDevice: string;
  message: string;
  error?: string;
  timestamp: number;
}

export async function triggerGpuDetection(): Promise<GpuDetectionResponse> {
  return apiRequest<GpuDetectionResponse>('/api/system/detect-gpu', { method: 'POST', timeoutMs: 15000 });
}

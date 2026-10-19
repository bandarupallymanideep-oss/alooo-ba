import type { DiscoveredCamera, OnvifProbeResult, OnvifStreamTestResult } from './types';
import { apiRequest } from './client';

export interface DiscoverResponse {
  success: boolean;
  cameras: DiscoveredCamera[];
  count: number;
  message: string;
}

export async function discoverOnvifCameras(timeout: number = 3.0): Promise<DiscoverResponse> {
  return apiRequest<DiscoverResponse>('/api/onvif/discover', {
    method: 'POST',
    body: { timeout },
    timeoutMs: Math.max(10000, (timeout + 2) * 1000),
  });
}

export async function probeOnvifCamera(params: {
  ip: string;
  port?: number;
  username?: string;
  password?: string;
  timeout?: number;
}): Promise<OnvifProbeResult> {
  return apiRequest<OnvifProbeResult>('/api/onvif/probe', {
    method: 'POST',
    body: {
      ip: params.ip.trim(),
      port: params.port || 80,
      username: params.username || '',
      password: params.password || '',
      timeout: params.timeout || 6.0,
    },
    timeoutMs: Math.max(12000, ((params.timeout || 6.0) + 3) * 1000),
  });
}

export async function testOnvifStream(streamUrl: string, timeout: number = 6.0): Promise<OnvifStreamTestResult> {
  return apiRequest<OnvifStreamTestResult>('/api/onvif/test-stream', {
    method: 'POST',
    body: { streamUrl, timeout },
    timeoutMs: Math.max(15000, (timeout + 4) * 1000),
  });
}

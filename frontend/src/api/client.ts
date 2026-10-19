export function getBackendUrl(): string {
  if (typeof window !== 'undefined') {
    if ((window as any).electronAPI?.getBackendUrl) {
      return (window as any).electronAPI.getBackendUrl();
    }
    if ((window as any).__SADARAKSHAK_BACKEND_URL__) {
      return (window as any).__SADARAKSHAK_BACKEND_URL__;
    }
    // If running inside Electron or file:// protocol, default to local backend
    if ((window as any).isElectron || window.location.protocol === 'file:') {
      return 'http://127.0.0.1:8000';
    }
  }
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
}

export const BACKEND_URL = getBackendUrl().replace(/\/+$/, '');

/** Turn a backend-relative path ("/detected_accidents/accident0.mp4") into an absolute URL. */
export function backendUrl(path?: string | null): string {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const base = getBackendUrl().replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export class ApiError extends Error {
  code: string;
  status: number;
  data: any;

  constructor(message: string, code = 'API_ERROR', status = 0, data: any = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

const unreachable = () =>
  new ApiError(
    `Cannot reach the SADARAKSHAK backend at ${getBackendUrl()}. Make sure it is running (python -m uvicorn app:app --port 8000).`,
    'BACKEND_UNREACHABLE'
  );

function errorFromBody(data: any, status: number): ApiError {
  const detail = data?.detail;
  const message =
    data?.message ||
    (typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join('; ') : '') ||
    `Request failed (HTTP ${status})`;
  return new ApiError(message, data?.code || `HTTP_${status}`, status, data);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
  timeoutMs?: number;
}

export async function apiRequest<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  let res: Response;
  try {
    res = await fetch(backendUrl(path), {
      method: opts.method || (opts.body || opts.formData ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError('The backend did not respond in time.', 'TIMEOUT');
    }
    throw unreachable();
  } finally {
    clearTimeout(timer);
  }
  let data: any = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) throw errorFromBody(data, res.status);
  return data as T;
}

/** multipart upload with progress (fetch cannot report upload progress) */
export function uploadWithProgress<T = any>(
  path: string,
  formData: FormData,
  onProgress?: (fraction: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', backendUrl(path));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(unreachable());
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { message: xhr.responseText };
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(errorFromBody(data, xhr.status));
    };
    xhr.send(formData);
  });
}

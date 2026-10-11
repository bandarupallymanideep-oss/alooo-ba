/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SADARAKSHAK FastAPI backend, e.g. http://localhost:8000 */
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

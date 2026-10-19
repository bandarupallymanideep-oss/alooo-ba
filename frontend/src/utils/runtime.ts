/**
 * Runtime environment detection for SADARAKSHAK.
 * 
 * Accurately distinguishes between:
 *   1. Installed Windows Desktop Application (Electron runtime or file:// protocol)
 *   2. Standalone Website (standard web browser over HTTP/HTTPS)
 */

export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;

  const w = window as any;
  return Boolean(
    w.electronAPI?.isDesktop ||
    w.__SADARAKSHAK_IS_DESKTOP__ ||
    w.isElectron ||
    w.location.protocol === 'file:'
  );
}

export function isStandaloneWebsite(): boolean {
  return !isDesktopApp();
}

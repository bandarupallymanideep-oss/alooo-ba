import type { User } from './types';

// Storage key kept unchanged so existing operator sessions stay signed in.
const AUTH_KEY = 'aegis_cctv_auth_v1';

/** Browser persistence for the local operator session (local authentication only). */
class MockStorage {
  getUser(): User | null {
    try {
      const data = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  setUser(user: User | null, rememberMe: boolean = true): void {
    if (user) {
      if (rememberMe) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        sessionStorage.removeItem(AUTH_KEY);
      } else {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
        localStorage.removeItem(AUTH_KEY);
      }
    } else {
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
    }
  }
}

export const mockStorage = new MockStorage();

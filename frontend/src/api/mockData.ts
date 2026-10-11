import type { User } from './types';

/**
 * Local demo operator profile used by the existing local authentication (auth.ts).
 * Cameras and accidents are no longer mocked - they come from the SADARAKSHAK backend.
 */
export const INITIAL_USER: User = {
  id: 'usr-001',
  username: 'admin',
  email: 'operator@trafficguard.ai',
  name: 'Commander Marcus Vance',
  role: 'Control Room Chief',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
  token: 'mock-jwt-token-traffic-guard-2026-auth-ok'
};

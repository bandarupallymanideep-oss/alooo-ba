import type { User } from './types';
import { INITIAL_USER } from './mockData';
import { mockStorage } from './mockStorage';

export interface LoginCredentials {
  emailOrUsername: string;
  password?: string;
  rememberMe?: boolean;
}

export async function login(credentials: LoginCredentials): Promise<{ user: User; token: string }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 350));

  const trimmed = credentials.emailOrUsername.trim().toLowerCase();
  
  // Accept standard demo logins or anything reasonable for testing
  if (!trimmed || !credentials.password) {
    throw new Error('Please enter both username/email and password.');
  }

  if (credentials.password.length < 4) {
    throw new Error('Password must be at least 4 characters long.');
  }

  // Validate credentials against mock demo accounts
  const isChief = (trimmed === 'operator@trafficguard.ai' || trimmed === 'admin' || trimmed === 'operator');
  const isAnalyst = (trimmed === 'analyst.chen@trafficguard.ai' || trimmed === 'analyst');

  if (isChief && credentials.password !== 'admin123') {
    throw new Error('Invalid security key. For Control Chief demo, use password: admin123');
  }

  if (isAnalyst && credentials.password !== 'analyst2026') {
    throw new Error('Invalid security key. For Incident Analyst demo, use password: analyst2026');
  }

  if (!isChief && !isAnalyst) {
    if (credentials.password !== 'admin123' && credentials.password !== 'analyst2026') {
      throw new Error('Access Denied: Unrecognized operator credentials. (Demo: operator@trafficguard.ai / admin123)');
    }
  }

  // Create or retrieve session user
  const user: User = {
    ...INITIAL_USER,
    email: trimmed.includes('@') ? trimmed : `${trimmed}@trafficguard.ai`,
    username: trimmed.split('@')[0],
    name: isChief 
      ? 'Commander Marcus Vance' 
      : isAnalyst 
      ? 'Senior Analyst Sarah Chen' 
      : `Operator ${trimmed.charAt(0).toUpperCase() + trimmed.slice(1)}`,
    role: isChief 
      ? 'Control Room Chief' 
      : isAnalyst 
      ? 'Incident Analyst' 
      : 'System Operator',
    token: `jwt-auth-session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  };

  mockStorage.setUser(user, credentials.rememberMe !== false);
  return { user, token: user.token! };
}

export async function logout(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 150));
  mockStorage.setUser(null);
}

export async function getCurrentUser(): Promise<User | null> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return mockStorage.getUser();
}

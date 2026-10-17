export type UserRole = 'admin' | 'member' | 'viewer';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export interface AppSettings {
  appName: string;
  defaultLocale: string;
  supportedLocales: string[];
  apiBaseUrl: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error?: string;
}

export const defaultAppSettings: AppSettings = {
  appName: 'HTV11',
  defaultLocale: 'en-US',
  supportedLocales: ['en-US', 'fr-FR'],
  apiBaseUrl: '/api'
};

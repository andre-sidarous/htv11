/**
 * App environment. Expo inlines EXPO_PUBLIC_* vars at bundle time, so keep each
 * `process.env.X` spelled out literally. Everything here ships inside the app and is
 * PUBLIC: secrets (Gemini, ntfy, service role) live only in Supabase Edge Function secrets.
 */
export const publicEnv = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  osrmUrl: process.env.EXPO_PUBLIC_OSRM_URL ?? "",
  enableDevLogin: process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === "true",
  forceMockServices: process.env.EXPO_PUBLIC_USE_MOCK_SERVICES === "true",
} as const;

export const isSupabaseConfigured = Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);

/** Mocks run when forced, or when Supabase isn't configured, so the app always boots. */
export const mockServicesEnabled = publicEnv.forceMockServices || !isSupabaseConfigured;

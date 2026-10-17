import "react-native-url-polyfill/auto";
import "./cryptoPolyfill";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

export type JamSupabaseClient = SupabaseClient<Database>;

let client: JamSupabaseClient | null = null;

/**
 * Shared Supabase client (singleton). Uses the anon key, so RLS applies to every query.
 * Returns null when Supabase isn't configured, so callers fall back to mocks instead of crashing.
 */
export function getSupabaseClient(): JamSupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (client) return client;

  client = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });

  // Only refresh tokens while the app is in the foreground.
  const supabase = client;
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });

  return client;
}

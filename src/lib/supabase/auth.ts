import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { publicEnv } from "@/lib/env";
import { getSupabaseClient } from "./client";

/**
 * Auth helpers for P2's screens. Each returns { error } instead of throwing,
 * so the UI can show a friendly message.
 *
 * Reliability in Expo Go, best first:
 *   1. Seeded demo accounts (signInWithDevAccount): no email, no browser.
 *   2. Email one-time code (sendEmailCode + verifyEmailCode): works everywhere.
 *   3. Google (signInWithGoogle): needs exp:// redirect URLs allowed in Supabase.
 */

type AuthResult = { error: string | null };

const notConfigured: AuthResult = { error: "Sign-in isn't available: Supabase is not configured." };

WebBrowser.maybeCompleteAuthSession();

/** Step 1 of email sign-in / sign-up. Creates the account if it doesn't exist. */
export async function sendEmailCode(email: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return { error: error?.message ?? null };
}

/** Step 2: the 6-digit code from the email (template must include {{ .Token }}; see docs/environment.md). */
export async function verifyEmailCode(email: string, code: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
  return { error: error?.message ?? null };
}

/** Seeded test accounts (supabase/seed.sql). Gated by EXPO_PUBLIC_ENABLE_DEV_LOGIN. */
export async function signInWithDevAccount(email: string, password: string): Promise<AuthResult> {
  if (!publicEnv.enableDevLogin) return { error: "Dev login is disabled." };
  const supabase = getSupabaseClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

/**
 * Google via the system browser. The redirect is an exp:// URL in Expo Go, which must be
 * allowed in Supabase (Authentication -> URL Configuration -> Redirect URLs: exp://**).
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return notConfigured;

  const redirectTo = Linking.createURL("auth/callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { error: error?.message ?? "Couldn't start Google sign-in." };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return { error: result.type === "cancel" || result.type === "dismiss" ? null : "Google sign-in didn't finish." };

  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === "string" ? queryParams.code : null;
  if (!code) return { error: "Google sign-in didn't return a code." };

  const exchange = await supabase.auth.exchangeCodeForSession(code);
  return { error: exchange.error?.message ?? null };
}

export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: null };
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

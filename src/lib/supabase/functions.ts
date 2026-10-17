import { scriptedSupportLine } from "@/lib/ai/supportCallLine";
import { SUPPORT_CALL_SCRIPT } from "@/lib/constants";
import type { AiCallContext, AiCallTurn, EscalationState, NotificationResult } from "@/lib/types";
import { getSupabaseClient } from "./client";

/**
 * Typed wrappers for Supabase Edge Functions (supabase/functions/*). These replace web
 * "server routes": secrets stay in Supabase, the app only sends the user's session token.
 * Every wrapper resolves (never throws) so screens can fall back gracefully.
 */

/** Readable message for a failed invoke: the function's own { detail } / { error } body when it sent one. */
export async function functionErrorMessage(name: string, error: { message: string; context?: unknown }): Promise<string> {
  const response = error.context;
  if (!(response instanceof Response)) return error.message;
  const text = await response.text().catch(() => "");
  if (response.status === 404 && text.includes("Requested function was not found")) return `The ${name} function isn't deployed`;
  try {
    const parsed = JSON.parse(text) as { error?: string; detail?: string };
    return parsed.detail ?? parsed.error ?? error.message;
  } catch {
    return error.message;
  }
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: "not_configured" };
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, { body });
    if (error) return { data: null, error: await functionErrorMessage(name, error) };
    return { data: data ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "invoke_failed" };
  }
}

export type AdvanceResult = { ok: boolean; advanced: boolean; state?: EscalationState; reason?: string; error?: string };

/** Idempotent escalation tick. Call when an alert's next_deadline_at passes. */
export function advanceAlert(alertId: string) {
  return invoke<AdvanceResult>("advance-alert", { alertId });
}

/** One support-call line (with directions + support-area note). Falls back to the scripted line on any failure. */
export async function getSupportCallTurn(context: AiCallContext, step: number): Promise<AiCallTurn> {
  const index = Math.max(0, Math.min(step, SUPPORT_CALL_SCRIPT.length - 1));
  const scripted: AiCallTurn = { text: scriptedSupportLine(context, index), source: "scripted", step: index };
  const { data } = await invoke<AiCallTurn>("ai-support-call", { context, step: index });
  return data?.text ? data : scripted;
}

/** Last escalation step: incident package, call + text trusted contacts (Twilio), ping the group. Safe to call twice. */
export async function callContacts(alertId: string, recordingPath?: string): Promise<NotificationResult[]> {
  const { data, error } = await invoke<{ results: NotificationResult[] }>("call-contacts", { alertId, recordingPath });
  return data?.results ?? [{ channel: "voice_call", status: "failed", detail: error ?? "unknown" }];
}

/** Rings one of your own trusted contacts with a short test message (checks Twilio + their number). */
export async function testContactCall(contactId: string): Promise<NotificationResult> {
  const { data, error } = await invoke<NotificationResult>("test-call", { contactId });
  return data ?? { channel: "voice_call", status: "failed", detail: error ?? "unknown" };
}

/** Publishes the fixed generic ntfy message for a Jam. */
export async function notifyNtfy(jamId: string, alertId: string): Promise<NotificationResult> {
  const { data, error } = await invoke<NotificationResult>("notify-ntfy", { jamId, alertId });
  return data ?? { channel: "ntfy", status: "failed", detail: error ?? "unknown" };
}

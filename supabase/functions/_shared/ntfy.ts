// Publishes ONLY the fixed NTFY_MESSAGE to a Jam's random topic, and logs the attempt.
// No health data, location, phone numbers, or recordings ever go to ntfy.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { NTFY_MESSAGE } from "./constants.ts";

const NTFY_TIMEOUT_MS = 5_000;

export type NtfyResult = { channel: "ntfy"; status: "sent" | "skipped" | "failed"; detail?: string };

export async function publishNtfy(
  admin: SupabaseClient,
  jam: { id: string; ntfy_topic: string },
  alertId: string | null,
  priority: "default" | "high" | "urgent" = "high",
  /** Stored as the log detail on success, so callers can tell which step already pinged. */
  label?: string,
): Promise<NtfyResult> {
  const base = (Deno.env.get("NTFY_BASE_URL") || "https://ntfy.sh").replace(/\/$/, "");
  const token = Deno.env.get("NTFY_TOKEN");
  let result: NtfyResult;
  try {
    const res = await fetch(`${base}/${jam.ntfy_topic}`, {
      method: "POST",
      headers: {
        Title: NTFY_MESSAGE.title,
        Priority: priority,
        Tags: "rotating_light",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: NTFY_MESSAGE.message,
      signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
    });
    result = res.ok
      ? { channel: "ntfy", status: "sent", detail: label }
      : { channel: "ntfy", status: "failed", detail: res.status === 429 ? "ntfy rate limit" : `ntfy returned ${res.status}` };
  } catch {
    result = { channel: "ntfy", status: "failed", detail: "Couldn't reach ntfy" };
  }
  await admin
    .from("notification_events")
    .insert({ jam_id: jam.id, alert_id: alertId, channel: "ntfy", status: result.status, detail: result.detail ?? null });
  return result;
}

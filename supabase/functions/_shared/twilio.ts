// Minimal Twilio REST client (calls + texts). Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
// Never log phone numbers: callers log the contact id and the Twilio sid only.
import { messageUrl } from "./callUrls.ts";

const TWILIO_TIMEOUT_MS = 8_000;

export type TwilioConfig = { sid: string; token: string; from: string };
export type TwilioResult = { ok: true; sid: string } | { ok: false; detail: string };

export function twilioConfig(): TwilioConfig | null {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  const from = normalizeFrom(Deno.env.get("TWILIO_FROM_NUMBER"));
  return sid && token && from ? { sid, token, from } : null;
}

/** "17372508034" or "+1 (737) 250-8034" → "+17372508034" (Twilio needs E.164). */
function normalizeFrom(raw: string | undefined): string | null {
  const compact = (raw ?? "").trim().replace(/[\s().-]/g, "");
  if (!compact) return null;
  return compact.startsWith("+") ? compact : `+${compact}`;
}

/** Friendly copy for the Twilio errors teams hit most. */
export function twilioError(code: number | undefined, message?: string): string {
  if (code === 572002 || code === 573002 || code === 572006 || code === 573006) {
    return "Twilio trial: add this number as a Verified Caller ID in the Twilio console first";
  }
  if (/limited parameter access/i.test(message ?? "")) return "Twilio trial blocked a call setting (upgrade Twilio, or update Huddle)";
  if (code === 21219 || code === 21608) return "Twilio trial: verify this number in the Twilio console first";
  if (code === 21210 || code === 21606) {
    return "TWILIO_FROM_NUMBER isn't a Twilio number on this account (buy one under Phone Numbers, then set it)";
  }
  if (code === 21212) return "TWILIO_FROM_NUMBER isn't a valid phone number (use +1XXXXXXXXXX)";
  if (code === 21211 || code === 21214 || code === 21614) return "Twilio couldn't use this phone number";
  if (code === 21408 || code === 21215) return "Twilio isn't allowed to reach this country yet (Geo permissions)";
  if (code === 20003 || code === 20404) return "Twilio credentials are wrong (check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)";
  return `Twilio error${code ? ` ${code}` : ""}`;
}

async function post(config: TwilioConfig, resource: "Calls" | "Messages", params: Record<string, string>): Promise<TwilioResult> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.sid}/${resource}.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.sid}:${config.token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: config.from, ...params }),
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, sid: String(body.sid ?? "?") };
    // Code + HTTP status only (never the numbers), so failures show up in the function logs.
    console.warn(`[twilio] ${resource} failed: HTTP ${res.status}, code ${body.code ?? "?"}`);
    return { ok: false, detail: twilioError(body.code, body.message) };
  } catch {
    return { ok: false, detail: "Couldn't reach Twilio" };
  }
}

/**
 * Rings `to` and reads `message`. Twilio fetches the words from our signed webhook URL: trial
 * accounts reject inline `Twiml` ("trial accounts have limited parameter access").
 */
export const placeCall = async (config: TwilioConfig, to: string, message: string) =>
  post(config, "Calls", { To: to, Url: await messageUrl(message) });
export const sendSms = (config: TwilioConfig, to: string, body: string) => post(config, "Messages", { To: to, Body: body });

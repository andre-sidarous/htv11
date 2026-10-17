// Minimal Twilio REST client (calls + texts). Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
// Never log phone numbers: callers log the contact id and the Twilio sid only.

const TWILIO_TIMEOUT_MS = 8_000;

export type TwilioConfig = { sid: string; token: string; from: string };
export type TwilioResult = { ok: true; sid: string } | { ok: false; detail: string };

export function twilioConfig(): TwilioConfig | null {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  return sid && token && from ? { sid, token, from } : null;
}

/** Friendly copy for the Twilio errors teams hit most. */
export function twilioError(code: number | undefined): string {
  if (code === 21219 || code === 21608) return "Twilio trial: verify this number in the Twilio console first";
  if (code === 21211 || code === 21214 || code === 21614) return "Twilio couldn't use this phone number";
  if (code === 21408) return "Twilio isn't allowed to reach this country yet (Geo permissions)";
  if (code === 20003) return "Twilio credentials are wrong";
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
    return res.ok ? { ok: true, sid: String(body.sid ?? "?") } : { ok: false, detail: twilioError(body.code) };
  } catch {
    return { ok: false, detail: "Couldn't reach Twilio" };
  }
}

export const placeCall = (config: TwilioConfig, to: string, twiml: string) => post(config, "Calls", { To: to, Twiml: twiml });
export const sendSms = (config: TwilioConfig, to: string, body: string) => post(config, "Messages", { To: to, Body: body });

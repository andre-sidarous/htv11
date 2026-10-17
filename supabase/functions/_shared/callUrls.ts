// Signed URLs that Twilio fetches (ai-call-webhook). Twilio can't send a user JWT, so every URL
// carries an HMAC of what it's for; the webhook rejects anything unsigned.
//
// Why URLs and not inline TwiML: Twilio trial accounts reject the `Twiml` (and `Method`, `Timeout`,
// `StatusCallbackMethod`) call parameters ("trial accounts have limited parameter access"), so even
// a fixed message is served from our webhook via `Url`.

async function hmacHex(message: string): Promise<string> {
  // A dedicated secret if set (rotatable on its own), else the service key the function already has.
  const secret = Deno.env.get("AI_CALL_SIGNING_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const WEBHOOK = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-call-webhook`;

// ---- the live AI call (one alert) ----

export const callSignature = (alertId: string) => hmacHex(`ai-call:${alertId}`);

export async function verifyCallSignature(alertId: string, sig: string | null): Promise<boolean> {
  return Boolean(sig) && sameText(await callSignature(alertId), sig!);
}

export async function webhookUrl(alertId: string, params: Record<string, string | number> = {}): Promise<string> {
  const qs = new URLSearchParams({
    alertId,
    sig: await callSignature(alertId),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  return `${WEBHOOK()}?${qs}`;
}

// ---- a fixed spoken message (trusted-contact calls, test calls) ----

const messageSignature = (message: string) => hmacHex(`say:${message}`);

export async function verifyMessageSignature(message: string, sig: string | null): Promise<boolean> {
  return Boolean(sig) && sameText(await messageSignature(message), sig!);
}

/** URL that makes Twilio read `message` (twice, so someone who picks up late still hears it). */
export async function messageUrl(message: string): Promise<string> {
  const qs = new URLSearchParams({ mode: "say", msg: message, sig: await messageSignature(message) });
  return `${WEBHOOK()}?${qs}`;
}

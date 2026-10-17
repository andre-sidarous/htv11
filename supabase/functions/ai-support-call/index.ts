// POST /functions/v1/ai-support-call  { context: AiCallContext, step: number } -> AiCallTurn
//
// Keeps GEMINI_API_KEY server-side. ALWAYS returns a usable turn: if Gemini is unconfigured,
// slow, rate-limited, or failing, it returns the scripted line (with P3's directions and
// support-area note when the app sent them). The app falls back to the same script as well.
// The last step ("your contacts may be notified") is always the fixed wording.
// Context is whitelisted below and must never include location history.
import { SUPPORT_CALL_SCRIPT } from "../_shared/constants.ts";
import { json, requireUser, serve } from "../_shared/supabase.ts";
import { scriptedSupportLine } from "../_shared/supportCallLine.ts";

const TIMEOUT_MS = 4_000;
const MAX_OUTPUT_CHARS = 400;
/** Per-user limit (per function instance; good enough for the POC). */
const RATE_LIMIT = { windowMs: 60_000, max: 8 };
const recentCalls = new Map<string, number[]>();

const DEVIATION_LEVELS = ["on_route", "slightly_off", "deviation", "significant_deviation"];
const ACTIVITIES = ["walking", "running", "stationary", "fall_simulated"];

type AiCallContext = {
  displayName: string;
  locationSummary: string;
  routeDeviationLevel?: string;
  heartRateSummary?: string;
  activity?: string;
  nearestSupportPoint?: string;
  groupResponded: boolean;
  destinationName?: string;
  /** P3's next spoken direction, e.g. "Head east for about 400 metres to Robarts Library." */
  guidance?: string;
  /** P3's support-area line, e.g. "You're in an area with few public support points. The nearest is …". */
  supportNote?: string;
};

const str = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : undefined;

/** Mirrors aiCallContextSchema in src/lib/validation. Unknown fields are dropped. */
function parseContext(raw: unknown): AiCallContext | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const displayName = str(c.displayName, 60);
  if (!displayName || typeof c.groupResponded !== "boolean") return null;
  if (c.locationSummary !== undefined && typeof c.locationSummary !== "string") return null;
  return {
    displayName,
    locationSummary: str(c.locationSummary, 200) ?? "unknown",
    routeDeviationLevel: DEVIATION_LEVELS.includes(c.routeDeviationLevel as string) ? (c.routeDeviationLevel as string) : undefined,
    heartRateSummary: str(c.heartRateSummary, 200),
    activity: ACTIVITIES.includes(c.activity as string) ? (c.activity as string) : undefined,
    nearestSupportPoint: str(c.nearestSupportPoint, 200),
    groupResponded: c.groupResponded,
    destinationName: str(c.destinationName, 120),
    guidance: str(c.guidance, 300),
    supportNote: str(c.supportNote, 300),
  };
}

function rateLimited(userId: string, now: number): boolean {
  const calls = (recentCalls.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  const limited = calls.length >= RATE_LIMIT.max;
  if (!limited) calls.push(now);
  recentCalls.set(userId, calls);
  return limited;
}

const SYSTEM_PROMPT = [
  "You are the voice of Jam, a group travel app, speaking on a short automated check-in call.",
  "You are NOT emergency services and NOT a medical service. Never diagnose, never mention illness,",
  "intoxication, assault, or danger, and never say you have called anyone or that help is on the way.",
  "Speak calmly and plainly, in at most three short sentences (under 55 words), addressing the person by first name.",
  "Rephrase the given intent line; keep its meaning exactly.",
  "If a direction is given, include it, keeping the street, compass direction, distance and place names exactly.",
  "If a support-area note is given on the first step, mention it briefly (e.g. few public support points nearby, and which is nearest).",
  "Never call a place or street safe or unsafe, and never say heart-rate numbers. Output only the words to speak.",
].join(" ");

/** Model output we won't speak: claims to be emergency/medical, or promises it can't keep. */
const BLOCKED = /\b(911|999|112|ambulance|paramedic|police (are|is) on|help is on the way|diagnos|medical|overdose|drunk|assault|heart attack|i('| ha)ve called)\b/i;

function userPrompt(context: AiCallContext, step: number): string {
  return [
    `Intent line for step ${step + 1} of ${SUPPORT_CALL_SCRIPT.length}: "${SUPPORT_CALL_SCRIPT[step]}"`,
    `Person: ${context.displayName}`,
    `Location summary: ${context.locationSummary}`,
    context.routeDeviationLevel ? `Route status: ${context.routeDeviationLevel.replaceAll("_", " ")}` : null,
    context.heartRateSummary ? `Simulated wearable: ${context.heartRateSummary}` : null,
    context.activity ? `Activity: ${context.activity.replaceAll("_", " ")}` : null,
    context.nearestSupportPoint ? `Nearest public support point: ${context.nearestSupportPoint}` : null,
    context.destinationName ? `Heading to: ${context.destinationName}` : null,
    context.guidance ? `Direction to give: ${context.guidance}` : null,
    step === 0 && context.supportNote ? `Support-area note: ${context.supportNote}` : null,
    `Group responded: ${context.groupResponded ? "yes" : "no"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callGemini(apiKey: string, context: AiCallContext, step: number): Promise<string | null> {
  // gemini-2.5-* are retired for new keys; the lite model answers in ~0.6s (and rejects thinkingConfig).
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt(context, step) }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.3 },
      }),
    });
    if (!res.ok) {
      console.warn(`[ai-support-call] gemini ${model} ${res.status}`);
      return null;
    }
    const data = await res.json();
    const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p) => p.text ?? "")
      .join("")
      .replace(/[*_#`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^"|"$/g, "");
    // Empty, too long, cut off mid-sentence, or saying something we won't: use the script instead.
    if (text.length < 20 || text.length > MAX_OUTPUT_CHARS || !/[.?!]$/.test(text) || BLOCKED.test(text)) return null;
    return text;
  } catch (error) {
    console.warn("[ai-support-call] gemini failed", error instanceof Error ? error.name : error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req, body) => {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const requested = typeof body.step === "number" && Number.isFinite(body.step) ? Math.floor(body.step) : 0;
  const step = Math.max(0, Math.min(requested, SUPPORT_CALL_SCRIPT.length - 1));
  const context = parseContext(body.context);
  const scripted = { text: scriptedSupportLine(context, step), source: "scripted", step };

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey || !context || step >= SUPPORT_CALL_SCRIPT.length - 1) return json(scripted);
  if (rateLimited(auth.user.id, Date.now())) return json(scripted);

  const text = await callGemini(apiKey, context, step);
  return json(text ? { text, source: "gemini", step } : scripted);
});

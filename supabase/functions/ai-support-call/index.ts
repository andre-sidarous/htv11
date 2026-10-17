// POST /functions/v1/ai-support-call  { context: AiCallContext, step: number } -> AiCallTurn
//
// Keeps GEMINI_API_KEY server-side. ALWAYS returns a usable turn: if Gemini is unconfigured,
// slow, rate-limited, or failing, it returns the scripted line. The app falls back to the script as well.
// Context is whitelisted below and must never include location history.
import { SUPPORT_CALL_SCRIPT } from "../_shared/constants.ts";
import { json, requireUser, serve } from "../_shared/supabase.ts";

const TIMEOUT_MS = 4_000;
const MAX_OUTPUT_CHARS = 240;
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
  "Speak calmly and plainly, in one or two short sentences (under 30 words), addressing the person by first name.",
  "Rephrase the given intent line; keep its meaning exactly. Output only the words to speak.",
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
    `Group responded: ${context.groupResponded ? "yes" : "no"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callGemini(apiKey: string, context: AiCallContext, step: number): Promise<string | null> {
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
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
        generationConfig: { maxOutputTokens: 80, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!res.ok) {
      console.warn(`[ai-support-call] gemini ${res.status}`);
      return null;
    }
    const data = await res.json();
    const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("").replace(/\s+/g, " ").trim().replace(/^"|"$/g, "");
    if (!text || text.length > MAX_OUTPUT_CHARS || BLOCKED.test(text)) return null;
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
  const scripted = { text: SUPPORT_CALL_SCRIPT[step], source: "scripted", step };

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json(scripted);

  const context = parseContext(body.context);
  if (!context) return json(scripted);
  if (rateLimited(auth.user.id, Date.now())) return json(scripted);

  const text = await callGemini(apiKey, context, step);
  return json(text ? { text, source: "gemini", step } : scripted);
});

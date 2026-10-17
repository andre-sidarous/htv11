// POST /functions/v1/ai-support-call  { context: AiCallContext, step: number } -> AiCallTurn
//
// Keeps GEMINI_API_KEY server-side. ALWAYS returns a usable turn: if Gemini is unconfigured,
// slow, or failing, it returns the scripted line. The app falls back to the script as well.
//
// P4 owns the Gemini call (see TODO). Context must never include location history.
import { SUPPORT_CALL_SCRIPT } from "../_shared/constants.ts";
import { json, requireUser, serve } from "../_shared/supabase.ts";

serve(async (req, body) => {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const requested = typeof body.step === "number" ? Math.floor(body.step) : 0;
  const step = Math.max(0, Math.min(requested, SUPPORT_CALL_SCRIPT.length - 1));
  const scripted = { text: SUPPORT_CALL_SCRIPT[step], source: "scripted", step };

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json(scripted);

  // TODO(P4): validate body.context (displayName, locationSummary, routeDeviationLevel,
  // heartRateSummary, activity, nearestSupportPoint, groupResponded), then call Gemini with
  // model Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash", a ~4s AbortController timeout,
  // and a short max output. Return { text, source: "gemini", step }. On ANY failure: json(scripted).
  return json(scripted);
});

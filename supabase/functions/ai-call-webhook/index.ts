// POST /functions/v1/ai-call-webhook?alertId=…&sig=…&turn=N   (called by TWILIO, not the app)
//
// One turn of the live AI support call: hear the person (Twilio speech-to-text / keypad), look at
// their latest location, real walking directions and nearby places, ask Gemini what to say, and keep
// listening. `event=status` is Twilio's call-ended callback. Deployed with verify_jwt = false;
// every request must carry the per-alert HMAC `sig` we generated when placing the call.
import {
  applyEvent,
  gather,
  gatherKnowledge,
  geminiTurn,
  holdDeadline,
  keywordIntent,
  markResponded,
  markUnresponsiveAndEscalate,
  MAX_TURNS,
  say,
  scriptedTurn,
  SILENT_TURNS_BEFORE_CONTACTS,
  twiml,
  verifyCallSignature,
  webhookUrl,
  type AlertRowLite,
  type Intent,
} from "../_shared/aiPhoneCall.ts";
import { verifyMessageSignature } from "../_shared/callUrls.ts";
import { buildTwiml } from "../_shared/callScript.ts";
import { escalateToContacts } from "../_shared/contactEscalation.ts";
import { adminClient, isUuid } from "../_shared/supabase.ts";

const HINTS = "yes, okay, I'm fine, I'm okay, help, I'm lost, where am I, how far, what's nearby, I'm here, I arrived, goodbye";
const RESPONDED_STATES = ["AI_CALL_USER_RESPONDED", "CONTACTS_NOTIFIED", "GROUP_MEMBER_ACKNOWLEDGED", "USER_RESPONDED"];

/** Run after the response is sent (contacts take a few seconds), so Twilio isn't kept waiting. */
function background(task: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  const safe = task.catch((error) => console.error("[ai-call] background task failed", error));
  if (runtime?.waitUntil) runtime.waitUntil(safe);
}

const hangup = (text: string) => twiml(`${say(text)}<Hangup/>`);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const query = new URL(req.url).searchParams;

  // A fixed message (trusted-contact call, test call): read it out, signed so nobody else can use us.
  if (query.get("mode") === "say") {
    const message = query.get("msg") ?? "";
    if (!message || !(await verifyMessageSignature(message, query.get("sig")))) return new Response("forbidden", { status: 403 });
    return new Response(buildTwiml(message), { headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const alertId = query.get("alertId");
  if (!isUuid(alertId) || !(await verifyCallSignature(alertId, query.get("sig")))) {
    return new Response("forbidden", { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    form = new FormData();
  }

  const admin = adminClient();
  const { data: row } = await admin
    .from("alerts")
    .select("id, jam_id, affected_user_id, escalation_state, reasons, resolved_at")
    .eq("id", alertId)
    .maybeSingle();
  const alert = row as AlertRowLite | null;

  // ---- Twilio: the call ended (or was never answered) ----
  if (query.get("event") === "status") {
    const status = String(form.get("CallStatus") ?? "");
    if (alert && !alert.resolved_at && (alert.escalation_state === "AI_CALL_STARTING" || alert.escalation_state === "AI_CALL_ACTIVE")) {
      // Hung up / no answer / busy / failed before ever responding → trusted contacts.
      console.log(`[ai-call] ${alertId} ended (${status}) without a response; escalating`);
      background(markUnresponsiveAndEscalate(admin, alert));
    }
    return new Response(null, { status: 204 });
  }

  if (!alert || alert.resolved_at) return hangup("Your group has marked you safe. Take care, and goodbye.");

  const turn = Number(query.get("turn") ?? 0) || 0;
  const silence = Number(query.get("silence") ?? 0) || 0;
  let contactsTold = query.get("help") === "1" || alert.escalation_state === "CONTACTS_NOTIFIED";
  const lastSaid = (query.get("last") ?? "").slice(0, 200);
  const speech = String(form.get("SpeechResult") ?? "").trim();
  const digits = String(form.get("Digits") ?? "").trim();
  const heard = speech || (digits ? "(they pressed a key)" : "");

  if (turn >= MAX_TURNS) return hangup("I'm going to end the call now. Your group can still see where you are. Take care.");

  const responded = RESPONDED_STATES.includes(alert.escalation_state);
  const next = async (text: string, extra: Record<string, string | number> = {}) =>
    gather(
      text,
      await webhookUrl(alertId, { turn: turn + 1, silence: 0, help: contactsTold ? 1 : 0, last: text.slice(0, 200), ...extra }),
      HINTS,
    );

  const knowledge = await gatherKnowledge(admin, alert);

  // ---- first turn: they picked up ----
  if (turn === 0) {
    await holdDeadline(admin, alert);
    const t = await geminiTurn(knowledge, { kind: "greeting", heard: "", lastSaid: "", responded, contactsTold });
    return twiml(await next(t?.say ?? scriptedTurn(knowledge, "greeting", "continue")));
  }

  // ---- silence ----
  if (!heard) {
    if (!responded) {
      if (silence + 1 >= SILENT_TURNS_BEFORE_CONTACTS) {
        background(markUnresponsiveAndEscalate(admin, alert));
        return hangup(
          `I haven't heard from you, ${knowledge.name}, so I'm notifying your trusted contacts now with your last known location. ` +
            "If you can, call your group back. If you're in immediate danger, call 9 1 1.",
        );
      }
      await holdDeadline(admin, alert);
    } else if (silence + 1 >= 3) {
      return hangup(`I'll let you go now, ${knowledge.name}. Your group can see your location. Take care.`);
    }
    const t = await geminiTurn(knowledge, { kind: "silence", heard: "", lastSaid, responded, contactsTold });
    return twiml(await next(t?.say ?? scriptedTurn(knowledge, "silence", "continue"), { silence: silence + 1 }));
  }

  // ---- they said something (or pressed a key) ----
  if (!responded) await markResponded(admin, alert);
  const ai = await geminiTurn(knowledge, { kind: "reply", heard, lastSaid, responded: true, contactsTold });
  const intent: Intent = ai?.intent ?? (digits && !speech ? "safe" : keywordIntent(heard));
  const text = ai?.say ?? scriptedTurn(knowledge, "reply", intent);

  if (intent === "help" && !contactsTold) {
    contactsTold = true;
    background(escalateToContacts(admin, alert.id));
  }
  if (intent === "arrived" || intent === "end") {
    await applyEvent(admin, alert, { type: "RESOLVE" });
    // Fixed goodbye: the model tends to ask a follow-up question right before we hang up.
    return hangup(scriptedTurn(knowledge, "reply", intent));
  }
  return twiml(await next(text));
});

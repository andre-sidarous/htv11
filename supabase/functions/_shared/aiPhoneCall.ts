// The AI support call as a REAL phone call (Twilio), instead of text-to-speech inside the app.
//
//   startAiPhoneCall(admin, alertId)   rings the affected person's phone (profiles.phone_number).
//                                      Called by ai-phone-call (the app) and advance-alert (server),
//                                      so it works even with every app closed. Idempotent per alert.
//   ai-call-webhook                    Twilio fetches each turn: it hears the person (speech → text),
//                                      re-reads their latest live location, gets real walking directions
//                                      (OSRM) and nearby public places (OpenStreetMap), and asks Gemini
//                                      what to say. The call stays open, guiding them, until they arrive,
//                                      say they're fine, or go silent (→ trusted contacts).
//
// Escalation: any speech/keypress = they responded (AI_CALL_USER_RESPONDED, escalation stops);
// two silent turns (~10s), no answer, or hanging up before responding = AI_CALL_USER_UNRESPONSIVE →
// CONTACTS_NOTIFIED (+ escalateToContacts). "I need help" alerts contacts while staying on the line.
// Never logs phone numbers or what the person said.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { escalateToContacts } from "./contactEscalation.ts";
import { escalationConfigFor, transition, type EscalationEvent, type EscalationState } from "./escalation.ts";
import { toE164 } from "./callScript.ts";
import supportPointsRaw from "./support-points.json" with { type: "json" };
import { webhookUrl } from "./callUrls.ts";
import { twilioConfig, twilioError, type TwilioConfig } from "./twilio.ts";

export const VOICE = "Polly.Joanna-Neural";
/** Seconds Twilio waits for speech/keys each turn. Two silent turns ≈ the 10s silence budget. */
export const LISTEN_S = 5;
export const SILENT_TURNS_BEFORE_CONTACTS = 2;
/** Hard stop so a forgotten call can't run up the bill. */
export const MAX_TURNS = 40;
/** While the call runs, keep advance-alert's backup deadline this far ahead (the call drives escalation). */
const CALL_DEADLINE_AHEAD_MS = 45_000;
/** Ringing + greeting before the backup deadline may treat it as unanswered. */
const RING_DEADLINE_MS = 75_000;
const OSRM_DEFAULT = "https://routing.openstreetmap.de/routed-foot";
const FETCH_TIMEOUT_MS = 3_500;

export type AlertRowLite = {
  id: string;
  jam_id: string;
  affected_user_id: string;
  escalation_state: EscalationState;
  reasons: unknown;
  resolved_at: string | null;
};

// ---------- auth for Twilio's requests (signed URLs; see callUrls.ts) ----------

export { callSignature, verifyCallSignature, webhookUrl } from "./callUrls.ts";

// ---------- escalation from the server ----------

/** Apply one escalation event with the Jam's real policy (compare-and-set). Returns the new state or null. */
export async function applyEvent(admin: SupabaseClient, alert: AlertRowLite, event: EscalationEvent): Promise<EscalationState | null> {
  const [{ data: jam }, { data: member }] = await Promise.all([
    admin.from("jams").select("checkin_delay_seconds, group_response_timeout_seconds").eq("id", alert.jam_id).maybeSingle(),
    admin
      .from("jam_members")
      .select("emergency_preference, ai_call_consent")
      .eq("jam_id", alert.jam_id)
      .eq("user_id", alert.affected_user_id)
      .maybeSingle(),
  ]);
  const config = escalationConfigFor({
    checkinDelaySeconds: jam?.checkin_delay_seconds,
    groupResponseTimeoutSeconds: jam?.group_response_timeout_seconds,
    emergencyPreference: member?.emergency_preference,
    aiCallConsent: member?.ai_call_consent,
  });
  const next = transition(alert.escalation_state, event, Date.now(), config);
  if (!next) return null;
  const { data } = await admin
    .from("alerts")
    .update({
      escalation_state: next.state,
      status: next.status,
      next_deadline_at: next.deadlineAt,
      ...(next.resolvedAt ? { resolved_at: next.resolvedAt } : {}),
    })
    .eq("id", alert.id)
    .eq("escalation_state", alert.escalation_state)
    .is("resolved_at", null)
    .select("escalation_state")
    .maybeSingle();
  if (!data) return null;
  alert.escalation_state = next.state;
  if (next.resolvedAt) alert.resolved_at = next.resolvedAt;
  return next.state;
}

/** They answered/spoke: the call is connected and they responded (escalation stops). */
export async function markResponded(admin: SupabaseClient, alert: AlertRowLite) {
  if (alert.escalation_state === "AI_CALL_STARTING") await applyEvent(admin, alert, { type: "AI_CALL_CONNECTED" });
  if (alert.escalation_state === "AI_CALL_ACTIVE") await applyEvent(admin, alert, { type: "AI_CALL_RESPONSE" });
}

/** No answer / silence / hung up before responding: on to the trusted contacts. */
export async function markUnresponsiveAndEscalate(admin: SupabaseClient, alert: AlertRowLite) {
  if (alert.escalation_state === "AI_CALL_STARTING") await applyEvent(admin, alert, { type: "AI_CALL_CONNECTED" });
  if (alert.escalation_state === "AI_CALL_ACTIVE") await applyEvent(admin, alert, { type: "AI_CALL_NO_RESPONSE" });
  if (alert.escalation_state === "AI_CALL_USER_UNRESPONSIVE") {
    const moved = await applyEvent(admin, alert, { type: "NOTIFY_CONTACTS" });
    if (moved === "CONTACTS_NOTIFIED") await escalateToContacts(admin, alert.id);
  }
}

/** While they're on the call, keep the backup deadline ahead so advance-alert never cuts in. */
export async function holdDeadline(admin: SupabaseClient, alert: AlertRowLite, aheadMs = CALL_DEADLINE_AHEAD_MS) {
  if (alert.escalation_state !== "AI_CALL_STARTING" && alert.escalation_state !== "AI_CALL_ACTIVE") return;
  await admin
    .from("alerts")
    .update({ next_deadline_at: new Date(Date.now() + aheadMs).toISOString() })
    .eq("id", alert.id)
    .eq("escalation_state", alert.escalation_state);
}

// ---------- starting the call ----------

export type StartResult =
  | { mode: "phone"; status: "calling" | "already_started" }
  | { mode: "app"; reason: string };

async function placeUrlCall(config: TwilioConfig, to: string, url: string, statusCallback: string) {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.sid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.sid}:${config.token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // Only parameters trial accounts accept (no Method / Timeout / StatusCallbackMethod: the
      // defaults are POST and ~60s ringing anyway).
      body: new URLSearchParams({
        From: config.from,
        To: to,
        Url: url,
        StatusCallback: statusCallback,
        StatusCallbackEvent: "completed",
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true as const, sid: String(body.sid ?? "?") };
    console.warn(`[ai-call] Calls failed: HTTP ${res.status}, code ${body.code ?? "?"}`);
    return { ok: false as const, detail: twilioError(body.code) };
  } catch {
    return { ok: false as const, detail: "Couldn't reach Twilio" };
  }
}

export async function startAiPhoneCall(admin: SupabaseClient, alertId: string): Promise<StartResult> {
  const { data: row } = await admin
    .from("alerts")
    .select("id, jam_id, affected_user_id, escalation_state, reasons, resolved_at")
    .eq("id", alertId)
    .maybeSingle();
  const alert = row as AlertRowLite | null;
  if (!alert || alert.resolved_at) return { mode: "app", reason: "alert_closed" };
  if (alert.escalation_state !== "AI_CALL_STARTING" && alert.escalation_state !== "AI_CALL_ACTIVE") {
    return { mode: "app", reason: "not_calling" };
  }

  // Already rung for this alert? (one call per alert)
  const { data: existing } = await admin
    .from("notification_events")
    .select("status, detail")
    .eq("alert_id", alertId)
    .eq("channel", "voice_call")
    .like("detail", "ai_call:%")
    .limit(1);
  if (existing?.length) {
    return existing[0].status === "failed"
      ? { mode: "app", reason: String(existing[0].detail ?? "").replace(/^ai_call:failed:/, "") || "call_failed" }
      : { mode: "phone", status: "already_started" };
  }

  const twilio = twilioConfig();
  if (!twilio) return { mode: "app", reason: "Phone calls aren't set up (Twilio secrets missing)" };
  const { data: profile } = await admin.from("profiles").select("phone_number").eq("id", alert.affected_user_id).maybeSingle();
  const to = toE164(profile?.phone_number);
  if (!to) return { mode: "app", reason: "No phone number on this profile" };

  // Claim it first so two callers can't both dial.
  const { data: claim } = await admin
    .from("notification_events")
    .insert({ jam_id: alert.jam_id, alert_id: alertId, channel: "voice_call", status: "sent", detail: "ai_call:pending" })
    .select("id")
    .single();

  const call = await placeUrlCall(twilio, to, await webhookUrl(alertId, { turn: 0 }), await webhookUrl(alertId, { event: "status" }));
  if (!call.ok) {
    if (claim) await admin.from("notification_events").update({ status: "failed", detail: `ai_call:failed:${call.detail}` }).eq("id", claim.id);
    return { mode: "app", reason: call.detail };
  }
  if (claim) await admin.from("notification_events").update({ detail: `ai_call:${call.sid}` }).eq("id", claim.id);
  await holdDeadline(admin, alert, RING_DEADLINE_MS);
  return { mode: "phone", status: "calling" };
}

// ---------- what the AI knows: live location, real directions, real nearby places ----------

export type CallKnowledge = {
  name: string;
  destination: string | null;
  /** Next one or two walking instructions from OSRM, spoken form. */
  directions: string | null;
  /** "about 1.2 kilometres, around 15 minutes" */
  remaining: string | null;
  /** Up to 3 named public places near them, nearest first: "Robarts Library, about 150 metres north-east". */
  places: string[];
  fewPlaces: boolean;
  locationAgeMin: number | null;
  reasons: string[];
};

const toRad = (d: number) => (d * Math.PI) / 180;
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function spokenDistance(m: number): string {
  if (m >= 950) {
    const km = (Math.round(m / 100) / 10).toFixed(1).replace(/\.0$/, "");
    return `about ${km} ${km === "1" ? "kilometre" : "kilometres"}`;
  }
  const rounded = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
  return `about ${rounded} metres`;
}

type OsrmStep = { distance: number; name: string; maneuver: { type: string; modifier?: string; bearing_after?: number } };

/** Unnamed paths (campus walkways, crossings) up to this long are described as "head X to <next street>". */
const UNNAMED_LEAD_MAX_M = 500;

/**
 * Spoken next directions from OSRM steps, always anchored on a real street name when there is one:
 *   "Head north on St. George Street for about 200 metres, then turn left onto Harbord Street."
 *   "Head south for about 120 metres to Harbord Street, then turn right onto it."   (unnamed paths first)
 * "continue" steps that stay on the same street are dropped.
 */
export function describeSteps(steps: OsrmStep[], destination: string | null): string | null {
  const arriveIndex = steps.findIndex((s) => s.maneuver.type === "arrive");
  const walk = (arriveIndex === -1 ? steps : steps.slice(0, arriveIndex)).filter(
    (s, i, all) =>
      !(i > 0 && (s.maneuver.type === "continue" || s.maneuver.type === "new name") && s.name && s.name === all[i - 1]?.name),
  );
  if (walk.length === 0) return destination ? `You're right by ${destination}.` : null;
  const reach = `you'll reach ${destination ?? "your destination"}`;
  const heading = compass(walk[0].maneuver.bearing_after ?? 0);
  const isLast = (s: OsrmStep) => walk.indexOf(s) === walk.length - 1;

  // 1. Starting on a named street.
  if (walk[0].name) {
    const opening = `Head ${heading} on ${walk[0].name} for ${spokenDistance(walk[0].distance)}`;
    const next = walk.slice(1).find((s) => s.name) ?? walk[1];
    if (!next) return `${opening}, and ${reach}.`;
    return `${opening}, then ${lower(maneuverPhrase(next))}${isLast(next) ? `, and ${reach}` : ""}.`;
  }

  // 2. Unnamed paths first: walk to the first named street, then the turn onto it.
  const namedIndex = walk.findIndex((s) => s.name);
  const lead = walk.slice(0, namedIndex === -1 ? walk.length : namedIndex).reduce((m, s) => m + s.distance, 0);
  if (namedIndex !== -1 && lead <= UNNAMED_LEAD_MAX_M) {
    const named = walk[namedIndex];
    const turn = lower(maneuverPhrase(named)).replace(` onto ${named.name}`, "");
    return `Head ${heading} for ${spokenDistance(lead)} to ${named.name}, then ${turn} onto it${isLast(named) ? `, and ${reach}` : ""}.`;
  }

  // 3. No street names nearby (parks, plazas): heading and distance only.
  if (namedIndex === -1) return `Head ${heading} for ${spokenDistance(lead)}, and ${reach}.`;
  return `Head ${heading} for ${spokenDistance(walk[0].distance)}, then ${lower(maneuverPhrase(walk[1] ?? walk[0]))}.`;
}

const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());

function maneuverPhrase(step: OsrmStep): string {
  const onto = step.name ? ` onto ${step.name}` : "";
  const mod = step.maneuver.modifier ?? "";
  switch (step.maneuver.type) {
    case "turn":
    case "end of road":
    case "fork":
      return mod === "straight" ? `Continue straight${onto}` : `Turn ${mod.replace("slight ", "slightly ").replace("sharp ", "sharp ")}${onto}`;
    case "new name":
    case "continue":
      return `Continue${onto}`;
    case "roundabout":
    case "rotary":
      return `Go through the roundabout${onto}`;
    case "arrive":
      return "You'll arrive";
    default:
      return mod ? `Go ${mod}${onto}` : `Continue${onto}`;
  }
}

export async function osrmDirections(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const base = (Deno.env.get("OSRM_URL") || OSRM_DEFAULT).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?steps=true&overview=false`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Huddle-hackathon/0.1" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const route = body.routes?.[0];
    if (!route) return null;
    return { steps: (route.legs?.[0]?.steps ?? []) as OsrmStep[], distance: route.distance as number, duration: route.duration as number };
  } catch {
    return null;
  }
}

type Place = { name: string; lat: number; lng: number; d: number };

/** Toronto support places bundled with the function (from the app's civic data; see server-support-points.mjs). */
const LOCAL_PLACES: { name: string; category: string; lat: number; lng: number }[] = (
  supportPointsRaw as [string, string, number, number][]
).map(([name, category, lat, lng]) => ({ name, category, lat: lat / 1e5, lng: lng / 1e5 }));

const LOCAL_RADIUS_M = 1_500;

function localPlaces(at: { lat: number; lng: number }): Place[] {
  return LOCAL_PLACES.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, d: distanceM(at, p) }))
    .filter((p) => p.d <= LOCAL_RADIUS_M)
    .sort((a, b) => a.d - b.d);
}

/** Nearby named public places: the bundled Toronto data first; OpenStreetMap (Overpass) elsewhere. */
export async function nearbyPlaces(at: { lat: number; lng: number }): Promise<Place[] | null> {
  const local = localPlaces(at);
  return local.length ? local : await overpassPlaces(at);
}

const PLACE_FILTER =
  'nwr(around:600,LAT,LNG)["amenity"~"^(library|police|hospital|clinic|pharmacy|community_centre|fire_station|townhall)$"]["name"];' +
  'nwr(around:600,LAT,LNG)["railway"="station"]["name"];';

async function overpassPlaces(at: { lat: number; lng: number }): Promise<Place[] | null> {
  const query = `[out:json][timeout:4];(${PLACE_FILTER.replaceAll("LAT", String(at.lat)).replaceAll("LNG", String(at.lng))});out center 20;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Huddle-hackathon/0.1" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const seen = new Set<string>();
    const places = (body.elements ?? [])
      .map((e: { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }) => {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        const name = e.tags?.name;
        if (!name || lat == null || lng == null) return null;
        return { name, lat, lng, d: distanceM(at, { lat, lng }) };
      })
      .filter((p: unknown): p is { name: string; lat: number; lng: number; d: number } => Boolean(p))
      .sort((a: { d: number }, b: { d: number }) => a.d - b.d)
      .filter((p: { name: string }) => (seen.has(p.name) ? false : (seen.add(p.name), true)));
    return places as { name: string; lat: number; lng: number; d: number }[];
  } catch {
    return null;
  }
}

/** Per-instance cache so each turn isn't re-querying Overpass for the same spot. */
const placeCache = new Map<string, { at: number; places: { name: string; lat: number; lng: number; d: number }[] | null }>();

export async function gatherKnowledge(admin: SupabaseClient, alert: AlertRowLite): Promise<CallKnowledge> {
  const [{ data: profile }, { data: jam }, { data: member }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", alert.affected_user_id).maybeSingle(),
    admin.from("jams").select("destination_name, destination_lat, destination_lng").eq("id", alert.jam_id).maybeSingle(),
    admin
      .from("jam_members")
      .select("location_consent, destination_name, destination_lat, destination_lng")
      .eq("jam_id", alert.jam_id)
      .eq("user_id", alert.affected_user_id)
      .maybeSingle(),
  ]);
  const { data: loc } = member?.location_consent
    ? await admin
        .from("live_locations")
        .select("latitude, longitude, last_seen_at")
        .eq("jam_id", alert.jam_id)
        .eq("user_id", alert.affected_user_id)
        .maybeSingle()
    : { data: null };

  const reasons = (Array.isArray(alert.reasons) ? (alert.reasons as unknown[]) : [])
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.replace(/\d+(\.\d+)?\s*%/g, "well").replace(/\.$/, ""))
    .slice(0, 2);
  // "I changed my destination" overrides the Huddle's destination for this person.
  const personal = member?.destination_lat != null && member.destination_lng != null;
  const dest = personal
    ? { name: member!.destination_name ?? "your new destination", lat: Number(member!.destination_lat), lng: Number(member!.destination_lng) }
    : jam?.destination_lat != null && jam.destination_lng != null
      ? { name: jam.destination_name ?? "your destination", lat: Number(jam.destination_lat), lng: Number(jam.destination_lng) }
      : null;
  const knowledge: CallKnowledge = {
    name: (profile?.display_name ?? "there").split(/\s+/)[0],
    destination: dest?.name ?? null,
    directions: null,
    remaining: null,
    places: [],
    fewPlaces: false,
    locationAgeMin: null,
    reasons,
  };
  if (!loc) return knowledge;

  const here = { lat: Number(loc.latitude), lng: Number(loc.longitude) };
  knowledge.locationAgeMin = Math.max(0, Math.round((Date.now() - Date.parse(loc.last_seen_at)) / 60_000));

  const key = `${here.lat.toFixed(4)},${here.lng.toFixed(4)}`;
  const cached = placeCache.get(key);
  const [route, places] = await Promise.all([
    dest ? osrmDirections(here, { lat: dest.lat, lng: dest.lng }) : Promise.resolve(null),
    cached && Date.now() - cached.at < 5 * 60_000 ? Promise.resolve(cached.places) : nearbyPlaces(here),
  ]);
  if (!cached || cached.places !== places) placeCache.set(key, { at: Date.now(), places });

  if (route) {
    knowledge.directions = describeSteps(route.steps, knowledge.destination);
    knowledge.remaining = `${spokenDistance(route.distance)}, around ${Math.max(1, Math.round(route.duration / 60))} minutes on foot`;
  }
  if (places) {
    knowledge.places = places.slice(0, 3).map((p) => `${p.name}, ${spokenDistance(p.d)} ${compass(bearing(here, p))}`);
    knowledge.fewPlaces = places.filter((p) => p.d <= 300).length < 2;
  }
  return knowledge;
}

// ---------- what the AI says ----------

export type Intent = "continue" | "safe" | "help" | "arrived" | "end";
export type Turn = { say: string; intent: Intent };

const SYSTEM_PROMPT = [
  "You are Huddle's automated support caller, speaking on a live PHONE CALL with someone whose travel group lost track of them.",
  "Huddle is a group travel safety app. You are NOT emergency services or a medical service: never diagnose, never say help is on the way,",
  "never claim to have called anyone except their trusted contacts when told so. If they say they are in danger, tell them to call 9 1 1.",
  "Goals: confirm they're okay, then guide them step by step to their destination using ONLY the directions given (never invent streets),",
  "mention the nearest public places when useful, answer their questions (where am I, how far, what's nearby), and keep them talking.",
  "Style: calm, warm, plain spoken English for text-to-speech. One or two short sentences (under 45 words). No lists, emoji, or markdown.",
  "Usually end with a short question so they keep responding. Say distances exactly as given.",
  'Reply ONLY with JSON: {"say": string, "intent": "continue" | "safe" | "help" | "arrived" | "end"}.',
  '"safe" = they say they are okay; "help" = they ask for help / feel unsafe / want their contacts told; "arrived" = they reached the destination;',
  '"end" = they want to hang up and are fine; otherwise "continue".',
].join(" ");

function knowledgeLines(k: CallKnowledge): string {
  return [
    `Person's first name: ${k.name}`,
    k.destination ? `Heading to: ${k.destination}` : "Destination: unknown",
    k.directions ? `Next directions (from their live location${k.locationAgeMin ? `, ${k.locationAgeMin} min old` : ""}): ${k.directions}` : "Directions: unavailable (no recent location)",
    k.remaining ? `Remaining: ${k.remaining}` : null,
    k.places.length ? `Nearby public places: ${k.places.join("; ")}` : "Nearby public places: none found",
    k.fewPlaces ? "Note: few public support points are close to them." : null,
    k.reasons.length ? `Why Huddle checked in: ${k.reasons.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const BLOCKED = /\b(ambulance|paramedic|police (are|is) (on|coming)|help is on the way|diagnos|overdose|drunk|heart attack|i('| ha)ve called (the )?(police|911))\b/i;

/** Keyword fallback when Gemini is off or fails. */
export function keywordIntent(heard: string): Intent {
  const t = heard.toLowerCase();
  if (/\b(help|scared|unsafe|danger|followed|hurt|emergency)\b/.test(t)) return "help";
  if (/\b(i'?m here|arrived|made it|i'?m at)\b/.test(t)) return "arrived";
  if (/\b(bye|hang up|stop calling|that'?s all)\b/.test(t)) return "end";
  if (/\b(ok|okay|fine|good|safe|alright|all right|yes|yeah)\b/.test(t)) return "safe";
  return "continue";
}

export function scriptedTurn(k: CallKnowledge, kind: "greeting" | "reply" | "silence", intent: Intent): string {
  const dir = k.directions ? ` ${k.directions}` : "";
  const near = k.places[0] ? ` The nearest public place is ${k.places[0]}.` : "";
  if (kind === "greeting") {
    return `Hi ${k.name}, this is Huddle, calling because your group couldn't reach you. Are you okay? You can just say yes, or press any key.${dir}`;
  }
  if (kind === "silence") return `${k.name}, are you still there? Say anything or press a key if you can hear me.${dir}`;
  if (intent === "help") return `I'm letting your trusted contacts know right now, and I'll stay with you.${near} If you're in immediate danger, call 9 1 1.`;
  if (intent === "arrived") return `You made it, ${k.name}. I'll let your group know you're safe. Take care, goodbye.`;
  if (intent === "end") return `Okay, ${k.name}. I'm glad you're okay. I'll let your group know. Goodbye.`;
  return `Thanks, ${k.name}.${dir || near}${k.remaining ? ` You have ${k.remaining} to go.` : ""} Tell me when you're there, or ask me anything.`;
}

export async function geminiTurn(
  k: CallKnowledge,
  context: { kind: "greeting" | "reply" | "silence"; heard: string; lastSaid: string; responded: boolean; contactsTold: boolean },
): Promise<Turn | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
  const prompt = [
    knowledgeLines(k),
    `They have ${context.responded ? "already responded on this call" : "not responded yet"}.`,
    context.contactsTold ? "Their trusted contacts have already been notified." : null,
    context.lastSaid ? `You last said: "${context.lastSaid}"` : null,
    context.kind === "greeting"
      ? "This is the start of the call: introduce yourself, say their group couldn't reach them, ask if they're okay (they can say yes or press a key), then give the first direction."
      : context.kind === "silence"
        ? "They said nothing. Gently check they can hear you (say anything or press a key) and repeat the next direction briefly."
        : `They just said: "${context.heard.slice(0, 300)}"`,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 220, temperature: 0.4, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(4_500),
    });
    if (!res.ok) {
      console.warn(`[ai-call] gemini ${model} ${res.status}`);
      return null;
    }
    const body = await res.json();
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    const parsed = JSON.parse(text) as { say?: unknown; intent?: unknown };
    const say = typeof parsed.say === "string" ? parsed.say.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim() : "";
    const intent = ["continue", "safe", "help", "arrived", "end"].includes(parsed.intent as string) ? (parsed.intent as Intent) : "continue";
    if (say.length < 8 || say.length > 420 || BLOCKED.test(say)) return null;
    return { say, intent };
  } catch (error) {
    console.warn("[ai-call] gemini failed", error instanceof Error ? error.name : error);
    return null;
  }
}

// ---------- TwiML ----------

const XML: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => XML[c]);

export const say = (text: string) => `<Say voice="${VOICE}" language="en-US">${esc(text)}</Say>`;

/** Speak, then listen (speech or any key). Twilio posts to `action` even on silence. */
export function gather(text: string, action: string, hints: string): string {
  return (
    `<Gather input="speech dtmf" numDigits="1" action="${esc(action)}" method="POST" timeout="${LISTEN_S}" ` +
    `speechTimeout="auto" language="en-US" speechModel="phone_call" enhanced="true" actionOnEmptyResult="true" ` +
    `hints="${esc(hints)}">${say(text)}</Gather>`
  );
}

export const twiml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });

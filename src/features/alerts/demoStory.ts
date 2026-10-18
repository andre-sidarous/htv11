import { DEMO_ACTION_IDS, demoActions } from "@/features/demo/demoActions";
import { getDemoContext } from "@/features/demo/demoContext";
import { demoFlags } from "@/features/demo/demoFlags";
import type { StoryStep } from "@/features/demo/storyRunner";
import { addAlertReasons, createCheckInAlert, dispatchAlertEvent, openAlertForUser } from "@/features/health/alertActions";
import { isMedicalLine } from "@/features/health/medicalAlert";
import { broadcast } from "@/features/health/safetyStore";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { EscalationState } from "@/lib/types";
import { currentUserId } from "./api";

/**
 * Demo Control's automated story (after "Reset demo"). Every step
 * uses the same demo actions and alert transitions as the manual buttons; between steps the alert's
 * deadline is held so the real timers don't run ahead of the narration. During the story the AI
 * support call runs inside the affected person's app (spoken and on screen, so it mirrors well).
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const HOLD_MS = 90_000;

/** Last incident package the story produced (for the "Open incident" button). */
export let storyIncidentId: string | null = null;

async function openAlert() {
  const { jamId, affectedUserId } = getDemoContext();
  return openAlertForUser(jamId, affectedUserId);
}

/** Keep the automatic escalation from firing while the story narrates. */
async function holdDeadline(ms = HOLD_MS) {
  const { jamId, affectedUserId } = getDemoContext();
  await getSupabaseClient()
    ?.from("alerts")
    .update({ next_deadline_at: new Date(Date.now() + ms).toISOString() })
    .eq("jam_id", jamId)
    .eq("affected_user_id", affectedUserId)
    .is("resolved_at", null);
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return true;
    await sleep(1_000);
  }
  return false;
}

async function alertState(): Promise<EscalationState | null> {
  return (await openAlert())?.escalation_state ?? null;
}

/** A check-in on their phone with these reasons (closing any older alert first). */
async function checkIn(reasons: string[], riskScore: number) {
  const { jamId, affectedUserId } = getDemoContext();
  const existing = await openAlert();
  if (existing && existing.escalation_state !== "CHECK_IN_SENT") await dispatchAlertEvent(existing, { type: "RESOLVE" });
  if (!existing || existing.escalation_state !== "CHECK_IN_SENT") {
    const created = await createCheckInAlert({
      jamId,
      userId: affectedUserId,
      evaluation: { riskScore, severity: riskScore >= 7 ? "high" : "moderate", reasons },
      requestedBy: (await currentUserId()) ?? affectedUserId,
    });
    if (!created) throw new Error("Couldn’t open a check-in for them.");
  } else {
    await demoActions.run(DEMO_ACTION_IDS.sendCheckIn);
  }
  await holdDeadline();
}

async function run(id: string) {
  if (!demoActions.has(id)) throw new Error(`"${id.replaceAll("_", " ")}" isn’t available. Open the Huddle once, then come back.`);
  await demoActions.run(id);
}

/** Tell every phone the story is on (in-app AI call) or off. */
export async function setStoryRunning(running: boolean, inAppCall = true) {
  const { jamId } = getDemoContext();
  const inApp = running && inAppCall;
  demoFlags.set({ storyRunning: running, inAppCall: inApp });
  await broadcast(jamId, "demo_story", { jamId, running, inAppCall: inApp, timestamp: new Date().toISOString() });
}

/**
 * Checked before the story starts. Blockers stop it (it would fail); warnings only make it weaker.
 * The presenter must be an ACTIVE member: alerts and timer holds are written as them (RLS).
 */
export async function storyPreflight(): Promise<{ blockers: string[]; warnings: string[] }> {
  const { jamId, affectedUserId } = getDemoContext();
  const supabase = getSupabaseClient();
  const me = await currentUserId();
  const blockers: string[] = [];
  if (!supabase || !me) return { blockers: ["Sign in first."], warnings: [] };
  const { data: mine } = await supabase.from("jam_members").select("is_active").eq("jam_id", jamId).eq("user_id", me).maybeSingle();
  if (!mine?.is_active) blockers.push("You’re not an active member of this Huddle. Rejoin it from Home (Past Huddles → Rejoin), then come back.");
  const { data: jam } = await supabase.from("jams").select("status").eq("id", jamId).maybeSingle();
  if (jam?.status !== "active") blockers.push("This Huddle hasn’t started yet. Start it from the lobby first.");
  if (affectedUserId === me) blockers.push("Pick someone else as the affected person (not the presenter’s phone).");
  const { data: m } = (await supabase
    .from("jam_members")
    .select("is_active, location_consent, health_consent, ai_call_consent, recording_consent, contact_notify_consent, emergency_preference, planned_route")
    .eq("jam_id", jamId)
    .eq("user_id", affectedUserId)
    .maybeSingle()) ?? { data: null };
  if (!m) return { blockers: [...blockers, "Pick the affected person (they must be in this Huddle)."], warnings: [] };
  const issues: string[] = [];
  if (!m.is_active) blockers.push("The affected person has left this Huddle.");
  if (!m.location_consent) issues.push("Their location sharing is off.");
  if (!m.health_consent) issues.push("Their health signals are off (no heart-rate spike).");
  if (!m.ai_call_consent || m.emergency_preference !== "ai_support_call") issues.push("Their AI support call is off (it will skip straight to contacts).");
  if (!m.recording_consent) issues.push("Their recording is off (no recording in the incident).");
  if (!m.contact_notify_consent) issues.push("Their trusted-contact notifications are off.");
  if (!m.planned_route) issues.push("They have no planned route yet: open the Map tab on their phone once (it plans and saves it).");
  return { blockers, warnings: issues };
}

const QUIET_STREET = "On a quiet street: few public places and no TTC stops within 300 metres.";
const OFF_PATH = "About 450 m off the planned path.";

/** Waits for their own answer to the check-in; nudges the timer if they ignore it. */
async function answerOrIgnore() {
  const answered = await waitFor(async () => (await alertState()) !== "CHECK_IN_SENT", 15_000);
  if (!answered) await run(DEMO_ACTION_IDS.simulateNoResponse);
  await holdDeadline();
}

async function addReasons(lines: string[]) {
  const alert = await openAlert();
  if (alert) await addAlertReasons(alert, lines);
}

/**
 * The story, on the presenter's phone (Demo Control). Before it: everyone picks their own
 * destination when joining (routes show on the map), and the presenter picks the affected person.
 */
export function buildDemoStory(): StoryStep[] {
  return [
    {
      id: "deviate",
      title: "Alex goes off their planned path",
      narration: "Everyone picked their own destination, and each route is on the map. Now Alex wanders about 450 metres off theirs.",
      delayMs: 4_000,
      run: () => run(DEMO_ACTION_IDS.moveAffectedUserAway),
    },
    {
      id: "checkin_off_path",
      title: "Huddle checks in with Alex only",
      narration: "Only Alex's phone asks: You're off your planned path. Are you okay? They can tap I'm lost, or ignore it.",
      delayMs: 2_000,
      run: () => checkIn([OFF_PATH], 4),
    },
    {
      id: "group_told",
      title: "The group is told",
      narration: "Alex taps I'm lost, or doesn't answer. Everyone else gets: Alex is off their planned path, check on them. They can tap Find Alex for a route to them.",
      delayMs: 1_000,
      run: answerOrIgnore,
    },
    {
      id: "walk_quiet",
      title: "Onto a quiet street",
      narration: "Alex keeps walking, onto a quiet residential street with few public places and no TTC stops nearby (City of Toronto open data).",
      delayMs: 8_000,
      run: async () => {
        await run(DEMO_ACTION_IDS.walkToQuietArea);
        await addReasons([QUIET_STREET]);
        await holdDeadline();
      },
    },
    {
      id: "heart_spike",
      title: "Their heart rate rises",
      narration:
        "Alex's heart rate climbs to 145. Their phone shares it with the group: above normal for their age, what's in their health profile, and Huddle's health estimate from CDC survey data.",
      delayMs: 6_000,
      run: async () => {
        await run(DEMO_ACTION_IDS.triggerHeartRateSpike);
        // The health lines come from Alex's own phone (only it can read their profile).
        await waitFor(async () => Boolean((await openAlert())?.reasons?.some(isMedicalLine)), 10_000);
        await holdDeadline();
      },
    },
    {
      id: "ai_call",
      title: "Huddle's AI calls Alex",
      narration:
        "Even if someone has tapped I'm going to help, Huddle's AI calls Alex now to guide them until help arrives, and records the call with their consent.",
      delayMs: 10_000,
      run: async () => {
        await run(DEMO_ACTION_IDS.startAiCall);
        await waitFor(async () => (await alertState()) === "AI_CALL_ACTIVE", 15_000);
        if (demoActions.has(DEMO_ACTION_IDS.simulateAiRecording)) await demoActions.run(DEMO_ACTION_IDS.simulateAiRecording).catch(() => undefined);
      },
    },
    {
      id: "converse",
      title: "They talk; it guides them",
      narration:
        "It tells Alex how to get back on their route and where the nearest busy public place is. Alex asks: Where am I? How do I get back? It answers each one. Watch the map.",
      delayMs: 4_000,
      run: () => run(DEMO_ACTION_IDS.walkTowardHelp),
    },
    {
      id: "contacts",
      title: "Alex stops replying",
      narration:
        "Alex goes quiet. Huddle asks once more, then sends the incident package to their emergency contact and the Huddle: location, why Huddle was concerned, the recording, and their Medical ID.",
      delayMs: 2_000,
      run: async () => {
        // Let the call on their phone end by itself (it stops and uploads the recording, then builds
        // the incident package with it). Only nudge it if their phone never gets there.
        const escalated = await waitFor(async () => {
          const s = await alertState();
          return s === "CONTACTS_NOTIFIED" || s === "AI_CALL_USER_UNRESPONSIVE";
        }, 150_000);
        if (!escalated) await run(DEMO_ACTION_IDS.simulateAiNonResponse);
        const supabase = getSupabaseClient();
        const alert = await openAlert();
        storyIncidentId = null;
        await waitFor(async () => {
          if (!supabase || !alert) return false;
          const { data } = await supabase.from("incident_packages").select("id").eq("alert_id", alert.id).is("deleted_at", null).maybeSingle();
          storyIncidentId = (data?.id as string | undefined) ?? null;
          return Boolean(storyIncidentId);
        }, 40_000);
      },
    },
  ];
}

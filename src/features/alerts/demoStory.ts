import { DEMO_ACTION_IDS, demoActions } from "@/features/demo/demoActions";
import { getDemoContext } from "@/features/demo/demoContext";
import { demoFlags } from "@/features/demo/demoFlags";
import type { StoryStep } from "@/features/demo/storyRunner";
import { createCheckInAlert, dispatchAlertEvent, openAlertForUser } from "@/features/health/alertActions";
import { broadcast } from "@/features/health/safetyStore";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { EscalationState } from "@/lib/types";
import { currentUserId } from "./api";

/**
 * Demo Control's automated story (after "Reset demo" and "Move affected user away"). Every step
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
export async function setStoryRunning(running: boolean) {
  const { jamId } = getDemoContext();
  demoFlags.set({ storyRunning: running, inAppCall: running });
  await broadcast(jamId, "demo_story", { jamId, running, inAppCall: running, timestamp: new Date().toISOString() });
}

/** Things that would make the story fall flat, checked before it starts. */
export async function storyPreflight(): Promise<string[]> {
  const { jamId, affectedUserId } = getDemoContext();
  const { data: m } = (await getSupabaseClient()
    ?.from("jam_members")
    .select("is_active, location_consent, health_consent, ai_call_consent, recording_consent, contact_notify_consent, emergency_preference")
    .eq("jam_id", jamId)
    .eq("user_id", affectedUserId)
    .maybeSingle()) ?? { data: null };
  if (!m) return ["Pick the affected person (they must be in this Huddle)."];
  const issues: string[] = [];
  if (!m.is_active) issues.push("They’ve left this Huddle.");
  if (!m.location_consent) issues.push("Their location sharing is off.");
  if (!m.health_consent) issues.push("Their health signals are off (no heart-rate spike).");
  if (!m.ai_call_consent || m.emergency_preference !== "ai_support_call") issues.push("Their AI support call is off (it will skip straight to contacts).");
  if (!m.recording_consent) issues.push("Their recording is off (no recording in the incident).");
  if (!m.contact_notify_consent) issues.push("Their trusted-contact notifications are off.");
  return issues;
}

export function buildDemoStory(): StoryStep[] {
  return [
    {
      id: "checkin_away",
      title: "Huddle checks in",
      narration: "Alex has drifted away from the group. Huddle quietly asks: you’re away from your group, are you okay?",
      delayMs: 5_000,
      run: () => checkIn(["Moved away from the group’s route."], 4),
    },
    {
      id: "no_answer_group",
      title: "No answer: the group is told",
      narration: "No answer, so everyone gets: Alex hasn’t answered, check on them.",
      delayMs: 6_000,
      run: async () => {
        await run(DEMO_ACTION_IDS.simulateNoResponse);
        await holdDeadline();
      },
    },
    {
      id: "heart_spike",
      title: "Heart rate spikes",
      narration: "Their heart rate jumps to 145. Huddle compares it with what’s normal for their age (CDC data) and their health profile, and gives them a heads-up.",
      delayMs: 10_000,
      run: async () => {
        await run(DEMO_ACTION_IDS.triggerHeartRateSpike);
        await holdDeadline();
      },
    },
    {
      id: "understood",
      title: "They tap “Understood”",
      narration: "Alex reads the heads-up and taps Understood. The group sees they responded.",
      delayMs: 1_000,
      run: async () => {
        const answered = await waitFor(async () => (await alertState()) === null, 12_000);
        if (!answered && (await openAlert())) await run(DEMO_ACTION_IDS.resolveAlert);
      },
    },
    {
      id: "walk_quiet",
      title: "They walk further, into a quiet area",
      narration: "They keep walking, into a residential street with few public places and no TTC stops nearby (City of Toronto open data).",
      delayMs: 5_000,
      run: () => run(DEMO_ACTION_IDS.walkToQuietArea),
    },
    {
      id: "checkin_quiet",
      title: "Check-in: away from public support",
      narration: "Huddle checks in again: they’re far from the route, with few public support places and no TTC stops around.",
      delayMs: 1_000,
      run: () => checkIn(["Moved far from the route, away from the group.", "Few public support places and no TTC stops within 300 metres."], 8),
    },
    {
      id: "no_answer_again",
      title: "No answer again",
      narration: "Still no answer. The group is alerted.",
      delayMs: 6_000,
      run: async () => {
        await run(DEMO_ACTION_IDS.simulateNoResponse);
        await holdDeadline();
      },
    },
    {
      id: "ai_call",
      title: "Nobody responds: Huddle’s AI calls them",
      narration: "Nobody in the group responds, so Huddle’s AI calls Alex: it says they’re away from public support and names the nearest place.",
      delayMs: 5_000,
      run: async () => {
        await run(DEMO_ACTION_IDS.simulateNoGroupResponse);
        await waitFor(async () => {
          const s = await alertState();
          return s === "AI_CALL_ACTIVE" || s === "AI_CALL_STARTING";
        }, 8_000);
      },
    },
    {
      id: "recording",
      title: "Recording on",
      narration: "With their consent, the call is recorded for the incident package.",
      delayMs: 3_000,
      run: async () => {
        if (demoActions.has(DEMO_ACTION_IDS.simulateAiRecording)) await demoActions.run(DEMO_ACTION_IDS.simulateAiRecording).catch(() => undefined);
      },
    },
    {
      id: "guide",
      title: "The AI guides them toward help",
      narration: "The AI stays on the call and guides them, step by step, toward the nearest library. Watch the map.",
      delayMs: 1_000,
      run: () => run(DEMO_ACTION_IDS.walkTowardHelp),
    },
    {
      id: "contacts",
      title: "No response: contacts called, incident sent",
      narration: "They stop responding. Huddle calls their trusted contact and shares an incident package: location, why Huddle was concerned, the recording, and their Medical ID.",
      delayMs: 2_000,
      run: async () => {
        const escalated = await waitFor(async () => {
          const s = await alertState();
          return s === "CONTACTS_NOTIFIED" || s === "AI_CALL_USER_UNRESPONSIVE";
        }, 25_000);
        if (!escalated) await run(DEMO_ACTION_IDS.simulateAiNonResponse);
        const supabase = getSupabaseClient();
        const alert = await openAlert();
        storyIncidentId = null;
        await waitFor(async () => {
          if (!supabase || !alert) return false;
          const { data } = await supabase.from("incident_packages").select("id").eq("alert_id", alert.id).is("deleted_at", null).maybeSingle();
          storyIncidentId = (data?.id as string | undefined) ?? null;
          return Boolean(storyIncidentId);
        }, 20_000);
      },
    },
  ];
}

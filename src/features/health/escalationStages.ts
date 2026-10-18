import type { EscalationState } from "@/lib/types";

/** Pure view model for <EscalationTimeline /> (no react-native imports, so vitest can test it). */

export type StageKey = "monitoring" | "check_in" | "group_alert" | "ai_call" | "contacts";
/** done: passed · active: happening now · settled: someone answered here, so it stopped · upcoming · skipped: never runs. */
export type StageStatus = "done" | "active" | "settled" | "upcoming" | "skipped";

export type TimelineStage = { key: StageKey; label: string; status: StageStatus };
export type Timeline = { stages: TimelineStage[]; current: string; next: string | null };

const LABELS: Record<StageKey, string> = {
  monitoring: "Monitoring",
  check_in: "Check-in",
  group_alert: "Group alert",
  ai_call: "AI support call",
  contacts: "Contacts notified",
};
const ORDER: StageKey[] = ["monitoring", "check_in", "group_alert", "ai_call", "contacts"];

/** Which stage a state belongs to, and whether a response stopped the escalation there. */
const POSITION: Record<Exclude<EscalationState, "RESOLVED" | "CANCELLED">, { index: number; settled?: boolean }> = {
  MONITORING: { index: 0 },
  CHECK_IN_SENT: { index: 1 },
  USER_RESPONDED: { index: 1, settled: true },
  GROUP_ALERT_SENT: { index: 2 },
  GROUP_MEMBER_ACKNOWLEDGED: { index: 2 },
  AI_CALL_STARTING: { index: 3 },
  AI_CALL_ACTIVE: { index: 3 },
  AI_CALL_USER_RESPONDED: { index: 3, settled: true },
  AI_CALL_USER_UNRESPONSIVE: { index: 3 },
  CONTACTS_NOTIFIED: { index: 4 },
};

const CURRENT: Record<EscalationState, string> = {
  MONITORING: "Huddle is quietly monitoring.",
  CHECK_IN_SENT: "Huddle is checking in.",
  USER_RESPONDED: "Answered the check-in.",
  GROUP_ALERT_SENT: "The group has been notified.",
  GROUP_MEMBER_ACKNOWLEDGED: "Someone from the group is on the way.",
  AI_CALL_STARTING: "Starting the support call.",
  AI_CALL_ACTIVE: "Support call in progress.",
  AI_CALL_USER_RESPONDED: "Responded on the support call.",
  AI_CALL_USER_UNRESPONSIVE: "No response on the call. Preparing the incident package.",
  CONTACTS_NOTIFIED: "Group and authorized contacts notified.",
  RESOLVED: "Marked safe.",
  CANCELLED: "Escalation cancelled.",
};

/**
 * Build the five-stage timeline for an alert state (null = no open alert, i.e. monitoring).
 * `aiCallAllowed` is false for `contact_only_alert` or no `ai_call_consent`; the call stage is skipped.
 */
export function timelineFor(state: EscalationState | null, aiCallAllowed = true): Timeline {
  const s = state ?? "MONITORING";
  if (s === "RESOLVED" || s === "CANCELLED") {
    return { stages: ORDER.map((key) => ({ key, label: LABELS[key], status: key === "monitoring" ? "active" : "upcoming" })), current: CURRENT[s], next: null };
  }
  const { index } = POSITION[s];
  // A helper on the way only stops the escalation when there's no AI call to start next.
  const settled = POSITION[s].settled || (s === "GROUP_MEMBER_ACKNOWLEDGED" && !aiCallAllowed);
  const stages = ORDER.map((key, i): TimelineStage => {
    let status: StageStatus = i < index ? "done" : i === index ? (settled ? "settled" : "active") : "upcoming";
    if ((key === "ai_call" && !aiCallAllowed) || (settled && i > index)) status = "skipped";
    return { key, label: LABELS[key], status };
  });
  return { stages, current: CURRENT[s], next: nextStep(s, aiCallAllowed) };
}

function nextStep(state: EscalationState, aiCallAllowed: boolean): string | null {
  switch (state) {
    case "MONITORING":
      return "Huddle only checks in when several signals change together.";
    case "CHECK_IN_SENT":
      return "If there’s no answer, the group is notified.";
    case "GROUP_MEMBER_ACKNOWLEDGED":
      return aiCallAllowed ? "Huddle’s AI calls them to guide them until help arrives." : null;
    case "GROUP_ALERT_SENT":
      return aiCallAllowed ? "If nobody responds, Huddle starts a support call." : "If nobody responds, trusted contacts are notified.";
    case "AI_CALL_STARTING":
    case "AI_CALL_ACTIVE":
      return "If there’s no answer, trusted contacts are notified.";
    case "AI_CALL_USER_UNRESPONSIVE":
      return "Trusted contacts are notified next.";
    case "USER_RESPONDED":
      return "This closes automatically in a few seconds.";
    default:
      return null;
  }
}

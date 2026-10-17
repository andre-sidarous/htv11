import type { AlertResponseKind, EscalationState } from "@/lib/types";

/** Pure copy helpers for alert cards (no react-native imports, so vitest can test them). */

export type ResponseStatus = "New" | "Seen" | "Acknowledged" | "Responding" | "Resolved";

const RANK: Record<AlertResponseKind, number> = { seen: 1, acknowledged: 2, responding: 3, safe: 4 };
const LABEL: Record<number, ResponseStatus> = { 0: "New", 1: "Seen", 2: "Acknowledged", 3: "Responding", 4: "Resolved" };

/** The group's furthest response so far, across all members. */
export function responseStatus(kinds: AlertResponseKind[], resolved: boolean): ResponseStatus {
  if (resolved) return "Resolved";
  return LABEL[Math.max(0, ...kinds.map((k) => RANK[k]))]!;
}

/** Calm, plain-language line for where escalation is. Never alarming. */
export function escalationLine(state: EscalationState, name: string): string {
  switch (state) {
    case "MONITORING":
    case "CHECK_IN_SENT":
      return `Huddle noticed a combination of changes and is checking in with ${name}.`;
    case "GROUP_ALERT_SENT":
      return `${name} hasn't answered Huddle's check-in. Your group has been notified.`;
    case "GROUP_MEMBER_ACKNOWLEDGED":
      return "Someone in your group is helping.";
    case "AI_CALL_STARTING":
    case "AI_CALL_ACTIVE":
      return `Huddle's support call with ${name} is active.`;
    case "AI_CALL_USER_RESPONDED":
    case "USER_RESPONDED":
      return `${name} responded.`;
    case "AI_CALL_USER_UNRESPONSIVE":
    case "CONTACTS_NOTIFIED":
      return `${name} hasn't responded. Their trusted contacts are being called.`;
    case "RESOLVED":
      return `${name} is marked safe.`;
    case "CANCELLED":
      return "This alert was cancelled.";
  }
}

/** "just now", "42 seconds ago", "3 minutes ago", "1 hour ago". */
export function formatAgo(fromIso: string | null | undefined, now = Date.now()): string {
  if (!fromIso) return "unknown";
  const s = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

/** Time left until a future moment: "about 23 hours", "40 minutes", "expired". */
export function formatRemaining(toIso: string, now = Date.now()): string {
  const m = Math.round((new Date(toIso).getTime() - now) / 60_000);
  if (m <= 0) return "expired";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  return `about ${h} hour${h === 1 ? "" : "s"}`;
}

export const isAiCallState = (state: EscalationState) =>
  state === "AI_CALL_STARTING" || state === "AI_CALL_ACTIVE" || state === "AI_CALL_USER_RESPONDED";

export const mapsUrl = (latitude: number, longitude: number) =>
  `https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;

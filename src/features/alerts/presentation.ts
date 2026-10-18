import type { AlertResponseKind, CheckInResponse, EscalationState } from "@/lib/types";

/** Pure copy helpers for alert cards (no react-native imports, so vitest can test them). */

export type ResponseStatus = "New" | "Seen" | "Acknowledged" | "Responding" | "Resolved";

const RANK: Record<AlertResponseKind, number> = { seen: 1, acknowledged: 2, responding: 3, safe: 4 };
const LABEL: Record<number, ResponseStatus> = { 0: "New", 1: "Seen", 2: "Acknowledged", 3: "Responding", 4: "Resolved" };

/** The group's furthest response so far, across all members. */
export function responseStatus(kinds: AlertResponseKind[], resolved: boolean): ResponseStatus {
  if (resolved) return "Resolved";
  return LABEL[Math.max(0, ...kinds.map((k) => RANK[k]))]!;
}

/** The alert was raised because they left their own planned path. */
export const isOffPath = (reasons: readonly string[] | null | undefined) => Boolean(reasons?.some((r) => /off the planned path/i.test(r)));

/** Card headline that reflects what they answered, if they answered. */
export function alertHeadline(
  name: string,
  response: CheckInResponse | null | undefined,
  resolved: boolean,
  reasons?: readonly string[] | null,
): string {
  if (resolved) return `${name} is marked safe.`;
  if (!response && isOffPath(reasons)) return `${name} is off their planned path.`;
  if (response === "im_lost") return `${name} is lost.`;
  if (response === "need_help") return `${name} asked for help.`;
  if (response === "cannot_respond") return `${name} can’t respond right now.`;
  if (response === "changed_destination") return `${name} changed their destination.`;
  return `${name} may need support.`;
}

/** Calm, plain-language line for where escalation is. Never alarming. */
export function escalationLine(state: EscalationState, name: string, response?: CheckInResponse | null, reasons?: readonly string[] | null): string {
  if (state === "GROUP_ALERT_SENT") {
    if (!response && isOffPath(reasons)) return `${name} is off their planned path and hasn’t answered Huddle’s check-in. Check in on them.`;
    if (response === "im_lost") return `${name} said they’re lost and is sharing their location. Tap Find ${name} for a route to them.`;
    if (response === "need_help") return `${name} asked for help. Your group has been notified.`;
    if (response === "cannot_respond") return `${name} said they can’t respond right now. Your group has been notified.`;
  }
  switch (state) {
    case "MONITORING":
    case "CHECK_IN_SENT":
      return `Huddle noticed a combination of changes and is checking in with ${name}.`;
    case "GROUP_ALERT_SENT":
      return `${name} hasn't answered Huddle's check-in. Your group has been notified.`;
    case "GROUP_MEMBER_ACKNOWLEDGED":
      return `Someone in your group is on the way. Huddle’s AI will call ${name} to guide them meanwhile.`;
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

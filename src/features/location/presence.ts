import { PRESENCE_OFFLINE_AFTER_MS, PRESENCE_STALE_AFTER_MS } from "@/lib/constants";
import type { MemberPresence } from "@/lib/types";

/**
 * Presence from the time since a member's last location update.
 * Staleness only describes connectivity. Never treat it as danger on its own.
 */
export type PresenceInput = {
  lastSeenAt: string | number | null | undefined;
  now: number;
  sharingEnabled?: boolean;
  /** The member's device reported it can't get a position. */
  unavailable?: boolean;
};

const toMs = (value: string | number) => (typeof value === "number" ? value : Date.parse(value));

export function presenceFor({ lastSeenAt, now, sharingEnabled = true, unavailable = false }: PresenceInput): MemberPresence {
  if (!sharingEnabled) return "paused";
  if (unavailable) return "unavailable";
  if (lastSeenAt == null) return "unavailable";
  const seen = toMs(lastSeenAt);
  if (!Number.isFinite(seen)) return "unavailable";
  const age = now - seen;
  if (age >= PRESENCE_OFFLINE_AFTER_MS) return "offline";
  if (age >= PRESENCE_STALE_AFTER_MS) return "stale";
  return "live";
}

/** "4 seconds ago", "2 minutes ago". */
export function formatAgo(ageMs: number): string {
  const s = Math.max(0, Math.round(ageMs / 1000));
  if (s < 60) return `${s} ${s === 1 ? "second" : "seconds"} ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(m / 60);
  return `${h} ${h === 1 ? "hour" : "hours"} ago`;
}

/** Calm status label for a member: Live, Last updated N seconds ago, Location paused, ... */
export function presenceLabel(presence: MemberPresence, lastSeenAt: string | number | null | undefined, now: number): string {
  switch (presence) {
    case "paused":
      return "Location paused";
    case "unavailable":
      return "Location unavailable";
    case "offline":
      return "Connection lost";
    case "stale":
      return lastSeenAt == null ? "Location unavailable" : `Last updated ${formatAgo(now - toMs(lastSeenAt))}`;
    case "live":
      return "Live";
  }
}

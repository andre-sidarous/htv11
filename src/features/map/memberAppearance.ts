import type { MemberPresence } from "@/lib/types";
import { colors } from "@/theme";

/** Friendly member colours (no red: that's reserved for confirmed escalation). */
const PROFILE_COLORS = ["#3b6ea5", "#2f8a5b", "#8a5bb5", "#b9772a", "#2c8a8a", "#a8557d", "#5a6fb5", "#6b8a2f"];

/** Stable colour per user id. */
export function profileColor(userId: string): string {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PROFILE_COLORS[(hash >>> 0) % PROFILE_COLORS.length]!;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

const ACTIVITY_LABEL: Record<string, string> = {
  walking: "Walking",
  running: "Running",
  stationary: "Stationary",
  fall_simulated: "Fall (simulated)",
};
export const activityLabel = (activity?: string) => (activity ? (ACTIVITY_LABEL[activity] ?? activity) : null);

/** Marker opacity by presence: stale/offline members fade but never turn red. */
export const PRESENCE_OPACITY: Record<MemberPresence, number> = {
  live: 1,
  stale: 0.75,
  offline: 0.5,
  paused: 0.5,
  unavailable: 0.5,
};

export const PRESENCE_DOT: Record<MemberPresence, string> = {
  live: colors.ok,
  stale: colors.amber,
  offline: colors.inkMuted,
  paused: colors.inkMuted,
  unavailable: colors.inkMuted,
};

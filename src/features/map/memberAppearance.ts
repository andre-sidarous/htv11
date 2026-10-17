import type { MemberPresence } from "@/lib/types";
import { colors } from "@/theme";

/**
 * Friendly member colours (no red: that's reserved for confirmed escalation). Chosen for strong
 * separation from each other at small marker size, not just distinct hues — the previous palette
 * had several muted blue/teal tones that read as "the same colour" at a glance on the map.
 */
const PROFILE_COLORS = [
  "#2563EB", // blue
  "#059669", // emerald
  "#7C3AED", // violet
  "#D97706", // amber
  "#DB2777", // pink
  "#0891B2", // cyan
  "#65A30D", // lime
  "#EA580C", // orange
  "#9333EA", // purple
  "#0D9488", // teal
];

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

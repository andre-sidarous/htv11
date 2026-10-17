import type { JamMemberRow } from "@/lib/types";

export type MemberReadiness = "ready" | "waiting" | "location_off" | "health_off";

const COPY: Record<MemberReadiness, string> = {
  ready: "Ready",
  waiting: "Waiting",
  location_off: "Location not shared",
  health_off: "Health signals off",
};

/** A calm, deterministic status label for the lobby and Group tab — never about danger. */
export function memberReadiness(member: Pick<JamMemberRow, "emergency_preference" | "location_consent" | "health_consent">): MemberReadiness {
  if (!member.emergency_preference) return "waiting";
  if (!member.location_consent) return "location_off";
  if (!member.health_consent) return "health_off";
  return "ready";
}

export function memberReadinessLabel(member: Pick<JamMemberRow, "emergency_preference" | "location_consent" | "health_consent">): string {
  return COPY[memberReadiness(member)];
}

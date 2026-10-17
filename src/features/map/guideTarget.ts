import { haversineM } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

/**
 * "Find Alex" (a member walks to someone who's lost) and "Guide me back to my group" (the lost
 * person walks to the nearest member). Pure, so it's unit-tested; JamMapScreen draws the route.
 */

export type GuideRequest = { kind: "member"; userId: string; name: string } | { kind: "group" };

export type GuideCandidate = {
  userId: string;
  name: string;
  position: LatLng | null;
  /** "live" | "stale" | "offline" | ... — offline members are poor targets. */
  presence: string;
  isActive: boolean;
};

export type GuideTarget = { userId: string; name: string; position: LatLng; distanceM: number };

export function pickGuideTarget(request: GuideRequest | null, me: LatLng | null, selfId: string | null, members: GuideCandidate[]): GuideTarget | null {
  if (!request || !me) return null;
  const usable = members.filter((m) => m.userId !== selfId && m.isActive && m.position);
  const withDistance = (m: GuideCandidate): GuideTarget => ({
    userId: m.userId,
    name: m.name,
    position: m.position!,
    distanceM: haversineM(me, m.position!),
  });

  if (request.kind === "member") {
    const target = usable.find((m) => m.userId === request.userId);
    return target ? withDistance(target) : null;
  }
  // Nearest member who's actually sharing; fall back to anyone with a last-known position.
  const live = usable.filter((m) => m.presence !== "offline");
  const pool = live.length ? live : usable;
  return pool.map(withDistance).sort((a, b) => a.distanceM - b.distanceM)[0] ?? null;
}

/** Turn-by-turn in the phone's maps app (Google Maps works on iOS and Android, in the app or browser). */
export const walkingDirectionsUrl = (to: LatLng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${to.latitude.toFixed(6)},${to.longitude.toFixed(6)}&travelmode=walking`;

/** Re-route only when someone moved this far, so the line doesn't refetch on every GPS tick. */
export const GUIDE_REROUTE_M = 25;

/** A stable key that changes only when either end moves ~25 m (≈ 4 decimal places). */
export const guideRouteKey = (from: LatLng, to: GuideTarget) =>
  `${to.userId}:${from.latitude.toFixed(4)},${from.longitude.toFixed(4)}>${to.position.latitude.toFixed(4)},${to.position.longitude.toFixed(4)}`;

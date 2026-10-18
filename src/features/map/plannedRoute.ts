import { haversineM } from "@/lib/geo";
import type { LatLng, PlannedRoute, Route } from "@/lib/types";

/**
 * A member's planned path to their own destination, saved on their jam_members row (migration 008)
 * so everyone can draw it and "off their planned path" has something to be measured against.
 * Pure, so it's unit-tested.
 */

/** Saved routes are thinned to about this many points (keeps the row small; plenty for drawing). */
export const PLAN_MAX_POINTS = 150;
/** A plan counts as "for" a destination within this distance of it. */
export const PLAN_MATCH_M = 40;

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

function thin(line: LatLng[], max: number): LatLng[] {
  if (line.length <= max) return line;
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) out.push(line[Math.round((i * (line.length - 1)) / (max - 1))]!);
  return out;
}

export function toPlannedRoute(route: Route, to: LatLng & { name?: string }, now = new Date()): PlannedRoute {
  return {
    to: { latitude: r5(to.latitude), longitude: r5(to.longitude), name: to.name ?? null },
    coordinates: thin(route.coordinates, PLAN_MAX_POINTS).map((p) => [r5(p.latitude), r5(p.longitude)] as [number, number]),
    distanceM: Math.round(route.distanceM),
    durationS: Math.round(route.durationS),
    isDemoRoute: route.isDemoRoute,
    plannedAt: now.toISOString(),
  };
}

/** Back to a drawable Route; null for anything malformed. */
export function fromPlannedRoute(plan: PlannedRoute | null | undefined): Route | null {
  if (!plan || !Array.isArray(plan.coordinates) || plan.coordinates.length < 2) return null;
  const coordinates = plan.coordinates
    .filter((c): c is [number, number] => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number")
    .map(([latitude, longitude]) => ({ latitude, longitude }));
  if (coordinates.length < 2) return null;
  return {
    coordinates,
    distanceM: plan.distanceM ?? 0,
    durationS: plan.durationS ?? 0,
    source: plan.isDemoRoute ? "demo" : "osrm",
    isDemoRoute: Boolean(plan.isDemoRoute),
  };
}

/** Is this saved plan for that destination (so it needn't be re-planned)? */
export const planMatches = (plan: PlannedRoute | null | undefined, destination: LatLng | null) =>
  Boolean(plan?.to && destination && haversineM(plan.to, destination) <= PLAN_MATCH_M);

import { haversineM } from "@/lib/geo";
import type { LatLng, Route, TravelMode } from "@/lib/types";

/**
 * Expected arrival, worked out instead of asked for: the real route's duration (OSRM) from where
 * they are to the destination, or a conservative straight-line estimate when routing is down.
 * Pure (no react-native), so it's unit-tested.
 */

export type TripEstimate = {
  minutes: number;
  distanceM: number;
  /** "route" = from the real walking route; "estimate" = straight line × detour factor. */
  source: "route" | "estimate";
};

/** Street detour over a straight line, and average speeds (m/s) for the fallback estimate. */
const DETOUR = 1.3;
const SPEED_M_S: Record<TravelMode, number> = { walking: 1.3, transit: 5, mixed: 3 };

/**
 * `route` must start at `from`. A demo-route fallback (the Campus Walk) only counts when the
 * destination really is that route's end; otherwise we estimate from the straight line.
 */
export function estimateTrip(from: LatLng, to: LatLng, mode: TravelMode, route: Route | null): TripEstimate {
  const routeEnd = route?.coordinates[route.coordinates.length - 1];
  const routeFits = route && routeEnd && (!route.isDemoRoute || haversineM(routeEnd, to) < 150) && route.durationS > 0;
  if (routeFits && mode === "walking") {
    return { minutes: Math.max(1, Math.round(route.durationS / 60)), distanceM: route.distanceM, source: "route" };
  }
  const distanceM = routeFits ? route.distanceM : haversineM(from, to) * DETOUR;
  return { minutes: Math.max(1, Math.round(distanceM / SPEED_M_S[mode] / 60)), distanceM, source: routeFits ? "route" : "estimate" };
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

const MODE_WORD: Record<TravelMode, string> = { walking: "walk", transit: "by transit", mixed: "trip" };

/** "About 14 min walk · 1.1 km" */
export function describeTrip(trip: TripEstimate, mode: TravelMode): string {
  return `About ${formatDuration(trip.minutes)} ${MODE_WORD[mode]} · ${formatDistance(trip.distanceM)}`;
}

export const arrivalTime = (trip: TripEstimate, now = Date.now()) => new Date(now + trip.minutes * 60_000);

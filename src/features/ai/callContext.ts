import { campusWalk } from "@/lib/demo/campusWalk";
import { haversineM } from "@/lib/geo";
import type { AiCallContext, HealthSignal, LatLng, RouteStatus, SupportPoint } from "@/lib/types";
import { heartRateIncreasePct } from "@/services/risk/engine";

/** Support points within this distance count as "nearby" for the call. */
const NEARBY_M = 800;

export function nearestSupportPoint(location: LatLng | null | undefined, points: readonly SupportPoint[] = campusWalk.supportPoints) {
  if (!location || points.length === 0) return null;
  let best: { point: SupportPoint; distanceM: number } | null = null;
  for (const point of points) {
    const distanceM = haversineM(location, point);
    if (!best || distanceM < best.distanceM) best = { point, distanceM };
  }
  return best && best.distanceM <= NEARBY_M ? best : null;
}

/**
 * The only data the AI support call may see: a location SUMMARY (never coordinates or history),
 * deviation level, a simulated heart-rate summary, activity, nearest support point, group response.
 */
export function buildCallContext(input: {
  displayName: string | null;
  location: LatLng | null;
  routeStatus?: RouteStatus;
  signal: HealthSignal | null;
  groupResponded: boolean;
}): AiCallContext {
  const nearest = nearestSupportPoint(input.location);
  const pct = heartRateIncreasePct(input.signal?.heartRate, input.signal?.baselineHeartRate);
  return {
    displayName: (input.displayName ?? "there").slice(0, 60),
    locationSummary: nearest
      ? `About ${Math.round(nearest.distanceM / 10) * 10} m from ${nearest.point.name}`
      : input.location
        ? "Location shared with the Jam"
        : "Location not available",
    routeDeviationLevel: input.routeStatus?.level,
    heartRateSummary: pct !== null ? `${pct > 0 ? `${pct}% above` : "near"} personal baseline (simulated)` : undefined,
    activity: input.signal?.activity,
    nearestSupportPoint: nearest?.point.name,
    groupResponded: input.groupResponded,
  };
}

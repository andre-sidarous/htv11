import { loadAllSupportPoints } from "@/features/map/civicData";
import { describeSupportNearby, getSpokenGuidance, spokenSupportPoints } from "@/features/map/guidance";
import { campusWalk } from "@/lib/demo/campusWalk";
import { haversineM } from "@/lib/geo";
import type { AiCallContext, HealthSignal, LatLng, Route, RouteStatus, RoutingService, SupportPoint, TravelMode } from "@/lib/types";
import { heartRateIncreasePct } from "@/services/risk/engine";

/** Support points within this distance count as "nearby" for the call. */
const NEARBY_M = 800;

export type CallDestination = LatLng & { name?: string };

/** Citywide (Toronto) support points; the Campus Walk demo points come first. */
export function nearestSupportPoint(location: LatLng | null | undefined, points: readonly SupportPoint[] = loadAllSupportPoints()) {
  if (!location || points.length === 0) return null;
  let best: { point: SupportPoint; distanceM: number } | null = null;
  for (const point of points) {
    const distanceM = haversineM(location, point);
    if (!best || distanceM < best.distanceM) best = { point, distanceM };
  }
  return best && best.distanceM <= NEARBY_M ? best : null;
}

/**
 * A walking route from where they are now to the Jam's destination, for spoken directions.
 * Null when routing fails, or when it fell back to the Campus Walk demo route for a different
 * destination (directions along the wrong route would be worse than a straight-line hint).
 */
export async function callRoute(
  service: RoutingService,
  from: LatLng,
  destination: CallDestination,
  mode: TravelMode = "walking",
): Promise<Route | null> {
  try {
    const route = await service.getRoute(from, destination, mode);
    if (route.isDemoRoute && haversineM(destination, campusWalk.destination) > 300) return null;
    return route.coordinates.length >= 2 ? route : null;
  } catch {
    return null;
  }
}

/**
 * The only data the AI support call may see: a location SUMMARY (never coordinates or history),
 * deviation level, a simulated heart-rate summary, activity, nearest support point, group response,
 * plus P3's spoken directions to the destination and the support-area note (both plain sentences).
 */
export function buildCallContext(input: {
  displayName: string | null;
  location: LatLng | null;
  routeStatus?: RouteStatus;
  signal: HealthSignal | null;
  groupResponded: boolean;
  /** The Jam's destination; enables spoken directions. */
  destination?: CallDestination | null;
  /** Route from `location` to the destination (see callRoute). Without it, directions are straight-line. */
  route?: Route | null;
}): AiCallContext {
  const nearest = nearestSupportPoint(input.location);
  const directions = input.location
    ? input.destination
      ? getSpokenGuidance({ position: input.location, route: input.route ?? null, destination: input.destination })
      : { guidance: undefined, supportNote: describeSupportNearby(input.location, spokenSupportPoints()) }
    : null;
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
    ...(input.destination?.name ? { destinationName: input.destination.name.slice(0, 120) } : {}),
    ...(directions?.guidance ? { guidance: directions.guidance.slice(0, 300) } : {}),
    ...(directions?.supportNote ? { supportNote: directions.supportNote.slice(0, 300) } : {}),
  };
}

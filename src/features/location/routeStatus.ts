import { ROUTE_DEVIATION_M } from "@/lib/constants";
import { distanceToPolylineM } from "@/lib/geo";
import type { LatLng, Route, RouteStatus } from "@/lib/types";

/**
 * Route deviation levels. Describes distance only; risk scoring belongs to P4.
 *   < 100m on route · 100-200m slightly off · > 200m deviation · > 350m significant
 */
export function routeLevel(distanceM: number): RouteStatus["level"] {
  if (distanceM > ROUTE_DEVIATION_M.significant) return "significant_deviation";
  if (distanceM > ROUTE_DEVIATION_M.deviation) return "deviation";
  if (distanceM >= ROUTE_DEVIATION_M.slightlyOff) return "slightly_off";
  return "on_route";
}

export function computeRouteStatus(userId: string, point: LatLng, route: Route): RouteStatus {
  const raw = distanceToPolylineM(point, route.coordinates);
  const distanceFromRouteM = Number.isFinite(raw) ? Math.round(raw) : 0;
  return {
    userId,
    distanceFromRouteM,
    level: Number.isFinite(raw) ? routeLevel(raw) : "on_route",
    isDemoRoute: route.isDemoRoute,
  };
}

export const ROUTE_LEVEL_LABEL: Record<RouteStatus["level"], string> = {
  on_route: "On route",
  slightly_off: "Slightly off route",
  deviation: "Off route",
  significant_deviation: "Far from route",
};

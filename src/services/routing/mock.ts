import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import { distanceToPolylineM } from "@/lib/geo";
import type { RoutingService } from "@/lib/types";

/** Demo routes from campus-walk.json. P3 adds OSRM and keeps this as the fallback. */
export const mockRoutingService: RoutingService = {
  async getRoute() {
    return toDemoRoute(campusWalk.plannedRoute);
  },
  async getAlternativeRoute() {
    return toDemoRoute(campusWalk.alternativeRoute);
  },
  calculateDistanceFromRoute(location, route) {
    return distanceToPolylineM(location, route.coordinates);
  },
};

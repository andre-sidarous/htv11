import { distanceToPolylineM } from "@/lib/geo";
import { publicEnv } from "@/lib/env";
import type { LatLng, Route, RoutingService } from "@/lib/types";
import { mockRoutingService } from "./mock";

/**
 * OSRM walking routes (e.g. EXPO_PUBLIC_OSRM_URL=https://routing.openstreetmap.de/routed-foot).
 * The app must never fail because routing is down: a blank URL, a timeout, or any error
 * returns the Campus Walk demo route (`isDemoRoute: true`), which the map labels "Demo route".
 * Transit/mixed Jams use the foot profile too; there's no transit router in the POC.
 */
export const OSRM_TIMEOUT_MS = 4_000;

type OsrmResponse = {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
};

type Fetch = typeof fetch;

export function createOsrmRoutingService(options: { baseUrl?: string; fetchImpl?: Fetch; timeoutMs?: number } = {}): RoutingService {
  const baseUrl = (options.baseUrl ?? publicEnv.osrmUrl).trim().replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? OSRM_TIMEOUT_MS;
  // One request per origin/destination serves both getRoute and getAlternativeRoute.
  const cache = new Map<string, Promise<Route[] | null>>();

  async function request(origin: LatLng, destination: LatLng): Promise<Route[] | null> {
    if (!baseUrl) return null;
    const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${baseUrl}/route/v1/foot/${coords}?overview=full&geometries=geojson&alternatives=true`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) return null;
      const body = (await response.json()) as OsrmResponse;
      if (body.code !== "Ok" || !body.routes?.length) return null;
      return body.routes
        .filter((r) => r.geometry?.coordinates?.length >= 2)
        .map((r) => ({
          coordinates: r.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
          distanceM: r.distance,
          durationS: r.duration,
          source: "osrm" as const,
          isDemoRoute: false,
        }));
    } catch (error) {
      console.warn("[routing] OSRM unavailable, using the demo route", error);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function routes(origin: LatLng, destination: LatLng) {
    const key = [origin.latitude, origin.longitude, destination.latitude, destination.longitude]
      .map((n) => n.toFixed(5))
      .join(",");
    let pending = cache.get(key);
    if (!pending) {
      pending = request(origin, destination);
      cache.set(key, pending);
      // Don't cache failures, so a later call can recover once the network is back.
      void pending.then((result) => {
        if (!result) cache.delete(key);
      });
    }
    return pending;
  }

  return {
    async getRoute(origin, destination, mode) {
      const result = await routes(origin, destination);
      return result?.[0] ?? mockRoutingService.getRoute(origin, destination, mode);
    },
    async getAlternativeRoute(origin, destination, mode) {
      const result = await routes(origin, destination);
      return result?.[1] ?? mockRoutingService.getAlternativeRoute(origin, destination, mode);
    },
    calculateDistanceFromRoute(location, route) {
      return distanceToPolylineM(location, route.coordinates);
    },
  };
}

export const osrmRoutingService: RoutingService = createOsrmRoutingService();

import { describe, expect, it } from "vitest";
import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import type { Route, RoutingService } from "@/lib/types";
import { aiCallContextSchema } from "@/lib/validation";
import { buildCallContext, callRoute, nearestSupportPoint } from "./callContext";

describe("buildCallContext", () => {
  const robarts = { latitude: 43.6644, longitude: -79.3994 };

  it("summarizes location without coordinates and passes the shared schema", () => {
    const context = buildCallContext({
      displayName: "Alex",
      location: { latitude: 43.6646, longitude: -79.3995 },
      routeStatus: { userId: "u", distanceFromRouteM: 260, level: "deviation", isDemoRoute: true },
      signal: {
        jamId: "j",
        userId: "u",
        heartRate: 145,
        baselineHeartRate: 75,
        activity: "running",
        movementState: "rapid",
        source: "simulated",
        timestamp: "2026-10-17T12:00:00.000Z",
      },
      groupResponded: false,
    });
    expect(context).toEqual({
      displayName: "Alex",
      locationSummary: "About 20 m from Robarts Library",
      routeDeviationLevel: "deviation",
      heartRateSummary: "93% above personal baseline (simulated)",
      activity: "running",
      nearestSupportPoint: "Robarts Library",
      groupResponded: false,
      supportNote: "You're in an area with few public support points. The nearest is Robarts Library, about 20 metres to the south.",
    });
    expect(JSON.stringify(context)).not.toMatch(/43\.66|79\.39/);
    expect(aiCallContextSchema.safeParse(context).success).toBe(true);
  });

  it("adds P3's spoken directions when the destination is known", () => {
    const offRoute = campusWalk.affectedUserOffRoutePath[campusWalk.affectedUserOffRoutePath.length - 1]!;
    const context = buildCallContext({
      displayName: "Alex",
      location: offRoute,
      signal: null,
      groupResponded: false,
      destination: campusWalk.destination,
      route: toDemoRoute(campusWalk.plannedRoute),
    });
    expect(context.destinationName).toBe("St. George Station");
    expect(context.guidance).toBe("Head east for about 400 metres to Robarts Library.");
    expect(context.supportNote).toMatch(/^You're in an area with few public support points\. The nearest is Robarts Library/);
    expect(JSON.stringify(context)).not.toMatch(/43\.6|79\.3/);
    expect(aiCallContextSchema.safeParse(context).success).toBe(true);
  });

  it("works anywhere in Toronto (citywide support points)", () => {
    const scarborough = { latitude: 43.7764, longitude: -79.2575 };
    const context = buildCallContext({ displayName: "Alex", location: scarborough, signal: null, groupResponded: false });
    expect(context.nearestSupportPoint).toBe("Scarborough Centre Station");
    expect(context.supportNote).toContain("Scarborough Centre Station");
  });

  it("handles missing data", () => {
    const context = buildCallContext({ displayName: null, location: null, signal: null, groupResponded: true });
    expect(context.locationSummary).toBe("Location not available");
    expect(aiCallContextSchema.safeParse(context).success).toBe(true);
  });

  it("ignores support points that are far away", () => {
    expect(nearestSupportPoint(robarts)?.point.name).toBe("Robarts Library");
    expect(nearestSupportPoint({ latitude: 43.4723, longitude: -80.5449 })).toBeNull(); // Waterloo
  });
});

describe("callRoute", () => {
  const from = { latitude: 43.7764, longitude: -79.2575 };
  const service = (route: Route | Error): RoutingService => ({
    getRoute: async () => {
      if (route instanceof Error) throw route;
      return route;
    },
    getAlternativeRoute: async () => {
      throw new Error("unused");
    },
    calculateDistanceFromRoute: () => 0,
  });
  const real: Route = { coordinates: [from, { latitude: 43.7731, longitude: -79.2578 }], distanceM: 400, durationS: 300, source: "osrm", isDemoRoute: false };

  it("returns a real route", async () => {
    expect(await callRoute(service(real), from, { latitude: 43.7731, longitude: -79.2578 })).toBe(real);
  });

  it("drops the Campus Walk fallback route for other destinations, and errors", async () => {
    const demo = { ...toDemoRoute(campusWalk.plannedRoute), isDemoRoute: true };
    expect(await callRoute(service(demo), from, { latitude: 43.7731, longitude: -79.2578 })).toBeNull();
    expect(await callRoute(service(demo), from, campusWalk.destination)).not.toBeNull();
    expect(await callRoute(service(new Error("offline")), from, campusWalk.destination)).toBeNull();
  });
});

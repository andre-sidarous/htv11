import { describe, expect, it } from "vitest";
import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import { distanceToPolylineM } from "@/lib/geo";
import { computeRouteStatus, routeLevel } from "./routeStatus";

describe("routeLevel", () => {
  it.each([
    [0, "on_route"],
    [99.9, "on_route"],
    [100, "slightly_off"],
    [200, "slightly_off"],
    [200.1, "deviation"],
    [350, "deviation"],
    [350.1, "significant_deviation"],
    [2_000, "significant_deviation"],
  ] as const)("%dm → %s", (distance, level) => {
    expect(routeLevel(distance)).toBe(level);
  });
});

describe("computeRouteStatus", () => {
  const route = toDemoRoute(campusWalk.plannedRoute);

  it("is on route at the start of the planned route", () => {
    const status = computeRouteStatus("u1", campusWalk.start, route);
    expect(status).toEqual({ userId: "u1", distanceFromRouteM: 0, level: "on_route", isDemoRoute: true });
  });

  it("flags the end of the off-route demo path as a significant deviation", () => {
    const end = campusWalk.affectedUserOffRoutePath[campusWalk.affectedUserOffRoutePath.length - 1]!;
    const status = computeRouteStatus("u1", end, route);
    expect(status.level).toBe("significant_deviation");
    expect(status.distanceFromRouteM).toBe(Math.round(distanceToPolylineM(end, route.coordinates)));
  });

  it("stays on_route for an empty route instead of reporting a deviation", () => {
    const empty = { ...route, coordinates: [] };
    expect(computeRouteStatus("u1", campusWalk.start, empty).level).toBe("on_route");
  });
});

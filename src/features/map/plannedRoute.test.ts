import { describe, expect, it } from "vitest";
import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import { PLAN_MAX_POINTS, fromPlannedRoute, planMatches, toPlannedRoute } from "./plannedRoute";

describe("planned routes", () => {
  const route = toDemoRoute(campusWalk.plannedRoute);

  it("round-trips a route through the saved form", () => {
    const plan = toPlannedRoute(route, { ...campusWalk.destination, name: "St. George Station" });
    const back = fromPlannedRoute(plan)!;
    expect(back.coordinates.length).toBe(route.coordinates.length);
    expect(back.coordinates[0]!.latitude).toBeCloseTo(route.coordinates[0]!.latitude, 4);
    expect(plan.to.name).toBe("St. George Station");
  });

  it("thins long routes", () => {
    const long = { ...route, coordinates: Array.from({ length: 1000 }, (_, i) => ({ latitude: 43.66 + i * 1e-5, longitude: -79.39 })) };
    expect(toPlannedRoute(long, campusWalk.destination).coordinates).toHaveLength(PLAN_MAX_POINTS);
  });

  it("matches only its own destination", () => {
    const plan = toPlannedRoute(route, campusWalk.destination);
    expect(planMatches(plan, campusWalk.destination)).toBe(true);
    expect(planMatches(plan, { latitude: 43.7, longitude: -79.4 })).toBe(false);
    expect(planMatches(null, campusWalk.destination)).toBe(false);
  });

  it("rejects malformed plans", () => {
    expect(fromPlannedRoute(null)).toBeNull();
    expect(fromPlannedRoute({ ...toPlannedRoute(route, campusWalk.destination), coordinates: [[1, 2]] })).toBeNull();
  });
});

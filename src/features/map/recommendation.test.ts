import { describe, expect, it } from "vitest";
import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import { haversineM } from "@/lib/geo";
import type { SupportPoint } from "@/lib/types";
import { loadTransitDisruption } from "./civicData";
import { getRouteRecommendation, joinList } from "./recommendation";

const planned = toDemoRoute(campusWalk.plannedRoute);
const alternative = toDemoRoute(campusWalk.alternativeRoute);
const group = campusWalk.members.map((m) => m.position);

describe("getRouteRecommendation (Campus Walk data)", () => {
  it("recommends the alternative when the planned route has a disruption and fewer support points", () => {
    const result = getRouteRecommendation({ route: planned, alternativeRoute: alternative, disruption: loadTransitDisruption() });
    expect(result.explanation).toBe(
      "This route has fewer nearby public support points and a current transit disruption. We recommend an alternative route.",
    );
    expect(result.alternativeRoute).toBe(alternative);
    expect(result.supportPoints.length).toBeGreaterThan(0);
  });

  it("works with no arguments (used by P5's incident screen)", () => {
    expect(getRouteRecommendation().explanation).toMatch(/We recommend an alternative route\.$/);
  });

  it("keeps the planned route and names TTC, a library, and the group when nothing is disrupted", () => {
    const result = getRouteRecommendation({
      route: planned,
      alternativeRoute: null,
      disruption: null,
      groupPositions: group,
    });
    expect(result.explanation).toBe("This route keeps you closer to TTC access, a public library, and your group.");
    expect(result.alternativeRoute).toBeNull();
  });

  it("orders support points nearest to the user first", () => {
    const user = campusWalk.destination;
    const result = getRouteRecommendation({ route: planned, alternativeRoute: null, disruption: null, userPosition: user });
    const distances = result.supportPoints.map((p) => haversineM(p, user));
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it("falls back to calm copy when no support data is near the route", () => {
    const farAway: SupportPoint[] = [
      { id: "x", name: "Far library", category: "library", latitude: 43.7, longitude: -79.5, source: "test" },
    ];
    const result = getRouteRecommendation({
      route: planned,
      alternativeRoute: null,
      supportPoints: farAway,
      transitStops: [],
      pedestrianNetwork: [],
      disruption: null,
    });
    expect(result.explanation).toBe("Few public support points are mapped along this route. Stay close to your group where you can.");
    expect(result.supportPoints).toEqual([]);
  });

  it("never labels a route safe or unsafe", () => {
    const cases = [
      getRouteRecommendation(),
      getRouteRecommendation({ disruption: null }),
      getRouteRecommendation({ alternativeRoute: null, disruption: null, groupPositions: group }),
    ];
    for (const r of cases) expect(r.explanation).not.toMatch(/\b(un)?safe\b|danger/i);
  });
});

describe("joinList", () => {
  it("joins with an Oxford comma", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"])).toBe("a, b, and c");
  });
});

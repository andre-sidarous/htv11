import { describe, expect, it } from "vitest";
import { campusWalk } from "@/lib/demo/campusWalk";
import { distanceToPolylineM, haversineM } from "@/lib/geo";
import { describeTransitNearby, nearestHelp, pickQuietSpot, straightPath, thinPath, transitNearby } from "./quietArea";

const offRouteEnd = campusWalk.affectedUserOffRoutePath[campusWalk.affectedUserOffRoutePath.length - 1]!;

describe("pickQuietSpot (Toronto data)", () => {
  const spot = pickQuietSpot(offRouteEnd, campusWalk.plannedRoute);

  it("finds a walkable spot off the route", () => {
    expect(spot).not.toBeNull();
    expect(haversineM(offRouteEnd, spot!)).toBeGreaterThanOrEqual(250);
    expect(distanceToPolylineM(spot!, campusWalk.plannedRoute)).toBeGreaterThanOrEqual(300);
  });

  it("has less transit around it than the busy campus core", () => {
    expect(transitNearby(spot!).count).toBeLessThanOrEqual(transitNearby(campusWalk.destination).count);
  });

  it("has somewhere to walk to for help", () => {
    const help = nearestHelp(spot!);
    expect(help?.name).toBeTruthy();
    expect(help!.distanceM).toBeLessThan(2_000);
  });
});

describe("transit and paths", () => {
  it("says when transit is scarce", () => {
    expect(describeTransitNearby({ latitude: 43.62, longitude: -79.47 })).toMatch(/TTC stop/);
    expect(describeTransitNearby(campusWalk.destination)).toBeNull(); // St. George Station area
  });

  it("builds walking paths of a set length", () => {
    expect(straightPath(campusWalk.start, campusWalk.destination, 4)).toHaveLength(5);
    expect(thinPath(campusWalk.plannedRoute, 2)).toHaveLength(3);
  });
});

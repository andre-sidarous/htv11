import { describe, expect, it } from "vitest";
import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import type { SupportPoint } from "@/lib/types";
import { bearingDeg, compassWord, getSpokenGuidance, spokenDistance, spokenStreetName } from "./guidance";

const route = toDemoRoute(campusWalk.plannedRoute);
const destination = campusWalk.destination;
const offRouteEnd = campusWalk.affectedUserOffRoutePath[campusWalk.affectedUserOffRoutePath.length - 1]!;

describe("getSpokenGuidance on the route", () => {
  it("gives direction, street, distance, and a landmark ahead", () => {
    const result = getSpokenGuidance({ position: campusWalk.start, route, destination });
    expect(result.guidance).toBe("Head north on St. George Street for about 300 metres, toward Robarts Library.");
    expect(result.nearestSupportPoint).toBeTruthy();
  });

  it("names the destination when the stretch reaches it", () => {
    const nearEnd = campusWalk.plannedRoute[3]!;
    expect(getSpokenGuidance({ position: nearEnd, route, destination }).guidance).toBe(
      "Head north on St. George Street for about 150 metres, toward St. George Station.",
    );
  });

  it("still uses route guidance when slightly off (under 200m)", () => {
    const slightlyOff = campusWalk.affectedUserOffRoutePath[1]!; // ~130m off
    expect(getSpokenGuidance({ position: slightlyOff, route, destination }).guidance).toMatch(/^Head north on St\. George Street/);
  });

  it("says you've arrived at the destination", () => {
    expect(getSpokenGuidance({ position: destination, route, destination }).guidance).toBe("You're at St. George Station.");
  });
});

describe("getSpokenGuidance off the route (> 200m)", () => {
  it("guides to the nearest support point when it's closer than the route", () => {
    const result = getSpokenGuidance({ position: offRouteEnd, route, destination });
    expect(result).toEqual({
      guidance: "Head east for about 400 metres to Robarts Library.",
      nearestSupportPoint: "Robarts Library",
    });
  });

  it("guides back to the route when no support point is closer", () => {
    const farPoint: SupportPoint = { id: "far", name: "Far Library", category: "library", latitude: 43.7, longitude: -79.5, source: "test" };
    const result = getSpokenGuidance({ position: offRouteEnd, route, destination, supportPoints: [farPoint] });
    expect(result.guidance).toMatch(/^Head east for about \d+ metres to get back to your route/);
    expect(result.nearestSupportPoint).toBe("Far Library");
  });

  it("omits nearestSupportPoint when there are none", () => {
    const result = getSpokenGuidance({ position: offRouteEnd, route, destination, supportPoints: [], streets: [] });
    expect(result.guidance).toBe("Head east for about 450 metres to get back to your route.");
    expect(result).not.toHaveProperty("nearestSupportPoint");
  });
});

describe("getSpokenGuidance without a route", () => {
  it("points straight at the destination", () => {
    expect(getSpokenGuidance({ position: campusWalk.start, route: null, destination }).guidance).toBe(
      "Head north for about 1 kilometre toward St. George Station.",
    );
  });

  it("falls back to 'your destination' when it has no name", () => {
    const { latitude, longitude } = destination;
    expect(getSpokenGuidance({ position: campusWalk.start, route: null, destination: { latitude, longitude } }).guidance).toMatch(
      /toward your destination\.$/,
    );
  });
});

describe("guidance wording", () => {
  it("never calls anything safe or unsafe", () => {
    const positions = [campusWalk.start, ...campusWalk.plannedRoute, ...campusWalk.affectedUserOffRoutePath];
    for (const position of positions) {
      expect(getSpokenGuidance({ position, route, destination }).guidance).not.toMatch(/\b(un)?safe\b|danger/i);
    }
  });

  it("rounds distances for speech", () => {
    expect(spokenDistance(4)).toBe("about 10 metres");
    expect(spokenDistance(73)).toBe("about 70 metres");
    expect(spokenDistance(212)).toBe("about 200 metres");
    expect(spokenDistance(230)).toBe("about 250 metres");
    expect(spokenDistance(1_000)).toBe("about 1 kilometre");
    expect(spokenDistance(1_240)).toBe("about 1.2 kilometres");
  });

  it("expands centreline abbreviations", () => {
    expect(spokenStreetName("St George St")).toBe("St. George Street");
    expect(spokenStreetName("Bloor St W")).toBe("Bloor Street West");
    expect(spokenStreetName("Queen's Park Cres E")).toBe("Queen's Park Crescent East");
    expect(spokenStreetName("Avenue Rd")).toBe("Avenue Road");
    expect(spokenStreetName("Queen's Park")).toBe("Queen's Park");
  });

  it("maps bearings to 8 compass words", () => {
    expect(compassWord(0)).toBe("north");
    expect(compassWord(350)).toBe("north");
    expect(compassWord(44)).toBe("north-east");
    expect(compassWord(90)).toBe("east");
    expect(compassWord(225)).toBe("south-west");
    expect(compassWord(-90)).toBe("west");
    expect(Math.round(bearingDeg({ latitude: 43.66, longitude: -79.4 }, { latitude: 43.67, longitude: -79.4 }))).toBe(0);
  });
});

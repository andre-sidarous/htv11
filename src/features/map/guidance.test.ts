import { describe, expect, it } from "vitest";
import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import type { SupportPoint } from "@/lib/types";
import { backToRouteLine, bearingDeg, compassWord, describeSupportNearby, getSpokenGuidance, spokenDistance, spokenStreetName } from "./guidance";

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
      supportNote: "You're in an area with few public support points. The nearest is Robarts Library, about 400 metres to the east.",
    });
  });

  it("guides back to the route when no support point is closer", () => {
    const farPoint: SupportPoint = { id: "far", name: "Far Library", category: "library", latitude: 43.7, longitude: -79.5, source: "test" };
    const result = getSpokenGuidance({ position: offRouteEnd, route, destination, supportPoints: [farPoint] });
    expect(result.guidance).toMatch(/^Head east for about \d+ metres to get back to your route/);
    // ~5 km away: outside the mapped area, so it's never named.
    expect(result).not.toHaveProperty("nearestSupportPoint");
    expect(result).not.toHaveProperty("supportNote");
  });

  it("omits nearestSupportPoint when there are none", () => {
    const result = getSpokenGuidance({ position: offRouteEnd, route, destination, supportPoints: [], streets: [] });
    expect(result.guidance).toBe("Head east for about 450 metres to get back to your route.");
    expect(result).not.toHaveProperty("nearestSupportPoint");
  });
});

describe("describeSupportNearby", () => {
  const at = (id: string, latitude: number, longitude: number): SupportPoint => ({ id, name: id, category: "library", latitude, longitude, source: "test" });
  const here = { latitude: 43.66, longitude: -79.4 };

  it("flags an area with few support points and names the nearest", () => {
    expect(describeSupportNearby(here, [at("Far Library", 43.664, -79.4)])).toBe(
      "You're in an area with few public support points. The nearest is Far Library, about 450 metres to the north.",
    );
  });

  it("just names the nearest when several are close", () => {
    expect(describeSupportNearby(here, [at("A", 43.6605, -79.4), at("B", 43.661, -79.4)])).toBe(
      "The nearest public support point is A, about 60 metres to the north.",
    );
  });

  it("says nothing when the nearest is outside the mapped area", () => {
    expect(describeSupportNearby(here, [at("Far away", 43.9, -79.4)])).toBeUndefined();
  });

  it("says nothing without support points", () => {
    expect(describeSupportNearby(here, [])).toBeUndefined();
  });
});

describe("getSpokenGuidance without a route", () => {
  it("points straight at the destination", () => {
    expect(getSpokenGuidance({ position: campusWalk.start, route: null, destination }).guidance).toBe(
      "Head north for about 1 kilometre toward St. George Station.",
    );
  });

  it("outside the mapped area: directions only, no far-away support point", () => {
    const waterloo = { latitude: 43.4723, longitude: -80.5449 };
    expect(getSpokenGuidance({ position: waterloo, route: null, destination: { latitude: 43.4643, longitude: -80.5204, name: "Uptown" } })).toEqual({
      guidance: "Head south-east for about 2.2 kilometres toward Uptown.",
    });
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

describe("backToRouteLine", () => {
  const line = [
    { latitude: 43.66, longitude: -79.4 },
    { latitude: 43.67, longitude: -79.4 },
  ];
  it("says how far and which way their planned route is", () => {
    // ~400 m east of a north-south route → head west.
    expect(backToRouteLine({ latitude: 43.665, longitude: -79.395 }, line, [])).toMatch(/^Your planned route is about \d+ metres west\. Head west to rejoin it\.$/);
  });
  it("says nothing when they're on it or there's no route", () => {
    expect(backToRouteLine({ latitude: 43.665, longitude: -79.4001 }, line, [])).toBeNull();
    expect(backToRouteLine({ latitude: 43.665, longitude: -79.395 }, null, [])).toBeNull();
  });
});

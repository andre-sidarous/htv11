import { describe, expect, it } from "vitest";
import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import { dedupePlaces, photonToPlace, placeAt, searchPlaces } from "./placeSearch";
import { describeTrip, estimateTrip, formatDistance, formatDuration } from "./tripEstimate";

const robarts = {
  geometry: { coordinates: [-79.39965, 43.66443] as [number, number] },
  properties: { name: "Robarts Library", housenumber: "130", street: "St George Street", city: "Toronto", state: "Ontario", country: "Canada" },
};

describe("photonToPlace", () => {
  it("names a place and builds a short address", () => {
    expect(photonToPlace(robarts)).toEqual({
      name: "Robarts Library",
      address: "130 St George Street, Toronto, Ontario",
      latitude: 43.66443,
      longitude: -79.39965,
    });
  });

  it("uses the street line when there is no name", () => {
    const place = photonToPlace({ geometry: { coordinates: [-79.4, 43.66] }, properties: { housenumber: "120", street: "Harbord Street", city: "Toronto" } });
    expect(place?.name).toBe("120 Harbord Street");
    expect(place?.address).toBe("Toronto");
  });

  it("skips results with no position or name", () => {
    expect(photonToPlace({ properties: { name: "x" } })).toBeNull();
    expect(photonToPlace({ geometry: { coordinates: [-79.4, 43.66] }, properties: {} })).toBeNull();
  });

  it("drops near-duplicates", () => {
    const a = photonToPlace(robarts)!;
    expect(dedupePlaces([a, { ...a, latitude: a.latitude + 0.0001 }, { ...a, name: "Other" }])).toHaveLength(2);
  });
});

describe("searchPlaces / placeAt", () => {
  const ok = (features: unknown[]) => async () => ({ ok: true, json: async () => ({ features }) });

  it("returns suggestions, biased to where they are", async () => {
    let url = "";
    const places = await searchPlaces("robarts", campusWalk.start, {
      fetchImpl: async (u) => {
        url = u;
        return ok([robarts])();
      },
    });
    expect(places?.[0]?.name).toBe("Robarts Library");
    expect(url).toContain("q=robarts");
    expect(url).toContain("lat=43.6");
  });

  it("returns [] for very short queries and null when search is unreachable", async () => {
    expect(await searchPlaces("r", null, { fetchImpl: ok([robarts]) })).toEqual([]);
    expect(await searchPlaces("robarts", null, { fetchImpl: async () => { throw new Error("offline"); } })).toBeNull();
  });

  it("names a dropped pin but keeps the exact spot", async () => {
    const pin = { latitude: 43.6644, longitude: -79.3996 };
    expect(await placeAt(pin, { fetchImpl: ok([robarts]) })).toMatchObject({ ...pin, name: "Robarts Library" });
    expect((await placeAt(pin, { fetchImpl: ok([]) })).name).toBe("Dropped pin");
  });
});

describe("estimateTrip", () => {
  const route = toDemoRoute(campusWalk.plannedRoute);

  it("uses the real route's duration when it reaches the destination", () => {
    const trip = estimateTrip(campusWalk.start, campusWalk.destination, "walking", route);
    expect(trip.source).toBe("route");
    expect(trip.minutes).toBe(Math.max(1, Math.round(route.durationS / 60)));
  });

  it("ignores the Campus Walk fallback route for another destination", () => {
    const scarborough = { latitude: 43.7764, longitude: -79.2575 };
    const trip = estimateTrip(campusWalk.start, scarborough, "walking", { ...route, isDemoRoute: true });
    expect(trip.source).toBe("estimate");
    expect(trip.minutes).toBeGreaterThan(200); // ~17 km on foot
  });

  it("formats durations and distances", () => {
    expect(formatDuration(14)).toBe("14 min");
    expect(formatDuration(75)).toBe("1 h 15 min");
    expect(formatDistance(1130)).toBe("1.1 km");
    expect(describeTrip({ minutes: 14, distanceM: 1130, source: "route" }, "walking")).toBe("About 14 min walk · 1.1 km");
  });
});

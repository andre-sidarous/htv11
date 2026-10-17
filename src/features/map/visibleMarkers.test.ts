import { describe, expect, it } from "vitest";
import type { SupportPoint } from "@/lib/types";
import { loadAllSupportPoints, loadTransitStops } from "./civicData";
import { MAX_STOP_MARKERS, MAX_SUPPORT_MARKERS, visibleStops, visibleSupportPoints, type MapRegion } from "./visibleMarkers";

const downtown: MapRegion = { latitude: 43.6532, longitude: -79.3832, latitudeDelta: 0.015, longitudeDelta: 0.015 };
const wholeCity: MapRegion = { latitude: 43.7, longitude: -79.4, latitudeDelta: 0.3, longitudeDelta: 0.3 };
const scarborough: MapRegion = { latitude: 43.7764, longitude: -79.2318, latitudeDelta: 0.02, longitudeDelta: 0.02 };

describe("citywide civic data", () => {
  it("covers Toronto beyond the Campus Walk area", () => {
    const points = loadAllSupportPoints();
    expect(points.length).toBeGreaterThan(1000);
    expect(points.some((p) => p.latitude > 43.75 && p.longitude > -79.3)).toBe(true); // Scarborough
    expect(points.some((p) => p.longitude < -79.5)).toBe(true); // Etobicoke
    expect(loadTransitStops().filter((s) => s.kind === "subway_station").length).toBeGreaterThan(60);
  });
});

describe("visibleSupportPoints", () => {
  it("draws only what's in view, capped", () => {
    const shown = visibleSupportPoints(loadAllSupportPoints(), downtown, new Set());
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(MAX_SUPPORT_MARKERS);
    expect(shown.every((p) => Math.abs(p.latitude - downtown.latitude) < 0.02)).toBe(true);
  });

  it("shows support points outside downtown too", () => {
    expect(visibleSupportPoints(loadAllSupportPoints(), scarborough, new Set()).length).toBeGreaterThan(0);
  });

  it("zoomed out: only the route's highlighted points", () => {
    const far: SupportPoint = { id: "x", name: "X", category: "library", latitude: 43.6, longitude: -79.6, source: "test" };
    expect(visibleSupportPoints([...loadAllSupportPoints(), far], wholeCity, new Set(["x"]))).toEqual([far]);
  });
});

describe("visibleStops", () => {
  it("hides stops when zoomed out and caps them when zoomed in", () => {
    const stops = loadTransitStops().filter((s) => s.kind === "surface_stop");
    expect(visibleStops(stops, wholeCity)).toEqual([]);
    const shown = visibleStops(stops, { ...downtown, latitudeDelta: 0.02, longitudeDelta: 0.02 });
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(MAX_STOP_MARKERS);
  });
});

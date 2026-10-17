import { describe, expect, it } from "vitest";
import { distanceToPolylineM, haversineM } from "./geo";

describe("haversineM", () => {
  it("is ~111 km per degree of latitude", () => {
    expect(haversineM({ latitude: 43, longitude: -79 }, { latitude: 44, longitude: -79 })).toBeCloseTo(111_195, -2);
  });
});

describe("distanceToPolylineM", () => {
  const line = [
    { latitude: 43.66, longitude: -79.4 },
    { latitude: 43.67, longitude: -79.4 },
  ];

  it("is ~0 for a point on the line", () => {
    expect(distanceToPolylineM({ latitude: 43.665, longitude: -79.4 }, line)).toBeLessThan(1);
  });

  it("measures perpendicular distance to the segment", () => {
    // 0.0025 deg of longitude at 43.665N is ~201 m.
    const d = distanceToPolylineM({ latitude: 43.665, longitude: -79.3975 }, line);
    expect(d).toBeGreaterThan(195);
    expect(d).toBeLessThan(207);
  });

  it("uses the nearest endpoint beyond the segment", () => {
    const beyond = { latitude: 43.671, longitude: -79.4 };
    expect(distanceToPolylineM(beyond, line)).toBeCloseTo(haversineM(beyond, line[1]!), 0);
  });

  it("handles empty and single-point lines", () => {
    expect(distanceToPolylineM({ latitude: 0, longitude: 0 }, [])).toBe(Number.POSITIVE_INFINITY);
    expect(distanceToPolylineM(line[0]!, [line[0]!])).toBe(0);
  });
});

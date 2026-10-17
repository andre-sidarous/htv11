import { describe, expect, it } from "vitest";
import { createLocationThrottle } from "./throttle";

const A = { latitude: 43.6597, longitude: -79.3972 };
/** ~5.6m north of A. */
const A_PLUS_5M = { latitude: 43.65975, longitude: -79.3972 };
/** ~11m north of A. */
const A_PLUS_11M = { latitude: 43.6598, longitude: -79.3972 };

describe("createLocationThrottle", () => {
  it("broadcasts about every 4s", () => {
    const t = createLocationThrottle();
    expect(t.shouldBroadcast(0)).toBe(true);
    expect(t.shouldBroadcast(2_000)).toBe(false);
    // A GPS fix that lands a little early still counts.
    expect(t.shouldBroadcast(3_900)).toBe(true);
    expect(t.shouldBroadcast(5_000)).toBe(false);
    expect(t.shouldBroadcast(8_000)).toBe(true);
  });

  it("upserts at most every 10s while barely moving", () => {
    const t = createLocationThrottle();
    expect(t.shouldUpsert(A, 0)).toBe(true);
    expect(t.shouldUpsert(A_PLUS_5M, 4_000)).toBe(false);
    expect(t.shouldUpsert(A_PLUS_5M, 8_000)).toBe(false);
    expect(t.shouldUpsert(A_PLUS_5M, 10_000)).toBe(true);
  });

  it("upserts early after a move of 10m or more", () => {
    const t = createLocationThrottle();
    expect(t.shouldUpsert(A, 0)).toBe(true);
    expect(t.shouldUpsert(A_PLUS_11M, 4_000)).toBe(true);
  });

  it("starts fresh after reset", () => {
    const t = createLocationThrottle();
    t.shouldBroadcast(0);
    t.shouldUpsert(A, 0);
    t.reset();
    expect(t.shouldBroadcast(1)).toBe(true);
    expect(t.shouldUpsert(A, 1)).toBe(true);
  });
});

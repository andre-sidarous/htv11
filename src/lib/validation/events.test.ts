import { describe, expect, it } from "vitest";
import { joinCodeSchema, parseRealtimeEvent } from "./index";

describe("parseRealtimeEvent", () => {
  it("accepts a valid location_update", () => {
    const payload = { jamId: "j", userId: "u", latitude: 43.66, longitude: -79.39, timestamp: "2026-10-17T12:00:00Z" };
    expect(parseRealtimeEvent("location_update", payload)).toEqual(payload);
  });

  it("drops malformed payloads", () => {
    expect(parseRealtimeEvent("location_update", { jamId: "j", latitude: 999 })).toBeNull();
    expect(parseRealtimeEvent("health_update", { jamId: "j", userId: "u", source: "real", timestamp: "t" })).toBeNull();
  });
});

describe("joinCodeSchema", () => {
  it("normalizes case and whitespace", () => {
    expect(joinCodeSchema.parse("  campus ")).toBe("CAMPUS");
  });

  it("rejects ambiguous characters", () => {
    expect(joinCodeSchema.safeParse("CAMP0S").success).toBe(false);
  });
});

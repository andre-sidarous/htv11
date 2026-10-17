import { describe, expect, it } from "vitest";
import { aiCallContextSchema } from "@/lib/validation";
import { buildCallContext, nearestSupportPoint } from "./callContext";

describe("buildCallContext", () => {
  const robarts = { latitude: 43.6644, longitude: -79.3994 };

  it("summarizes location without coordinates and passes the shared schema", () => {
    const context = buildCallContext({
      displayName: "Alex",
      location: { latitude: 43.6646, longitude: -79.3995 },
      routeStatus: { userId: "u", distanceFromRouteM: 260, level: "deviation", isDemoRoute: true },
      signal: {
        jamId: "j",
        userId: "u",
        heartRate: 145,
        baselineHeartRate: 75,
        activity: "running",
        movementState: "rapid",
        source: "simulated",
        timestamp: "2026-10-17T12:00:00.000Z",
      },
      groupResponded: false,
    });
    expect(context).toEqual({
      displayName: "Alex",
      locationSummary: "About 20 m from Robarts Library",
      routeDeviationLevel: "deviation",
      heartRateSummary: "93% above personal baseline (simulated)",
      activity: "running",
      nearestSupportPoint: "Robarts Library",
      groupResponded: false,
    });
    expect(JSON.stringify(context)).not.toMatch(/43\.66|79\.39/);
    expect(aiCallContextSchema.safeParse(context).success).toBe(true);
  });

  it("handles missing data", () => {
    const context = buildCallContext({ displayName: null, location: null, signal: null, groupResponded: true });
    expect(context.locationSummary).toBe("Location not available");
    expect(aiCallContextSchema.safeParse(context).success).toBe(true);
  });

  it("ignores support points that are far away", () => {
    expect(nearestSupportPoint(robarts)?.point.name).toBe("Robarts Library");
    expect(nearestSupportPoint({ latitude: 43.7, longitude: -79.5 })).toBeNull();
  });
});

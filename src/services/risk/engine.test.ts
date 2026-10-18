import { describe, expect, it } from "vitest";
import type { HealthSignal, RiskInput, RouteStatus } from "@/lib/types";
import { evaluateRisk, heartRateIncreasePct } from "./engine";

const signal = (over: Partial<HealthSignal> = {}): HealthSignal => ({
  jamId: "jam",
  userId: "alex",
  heartRate: 80,
  baselineHeartRate: 75,
  activity: "walking",
  movementState: "normal",
  source: "simulated",
  timestamp: "2026-10-17T12:00:00.000Z",
  ...over,
});

const route = (level: RouteStatus["level"], distanceFromRouteM: number): RouteStatus => ({
  userId: "alex",
  distanceFromRouteM,
  level,
  isDemoRoute: true,
});

const input = (over: Partial<RiskInput> = {}): RiskInput => ({
  signal: signal(),
  separatedFromGroup: false,
  checkInUnanswered: false,
  ...over,
});

describe("evaluateRisk", () => {
  it("normal walking → 0, monitor", () => {
    expect(evaluateRisk(input())).toEqual({
      riskScore: 0,
      severity: "low",
      reasons: [],
      recommendedAction: "continue_monitoring",
    });
  });

  it("no signal at all is still safe to evaluate", () => {
    expect(evaluateRisk({ separatedFromGroup: false, checkInUnanswered: false }).riskScore).toBe(0);
  });

  describe("heart rate", () => {
    it("39% above baseline scores nothing", () => {
      expect(evaluateRisk(input({ signal: signal({ heartRate: 104 }) })).riskScore).toBe(0); // 38.7%
    });
    it("≥40% scores +2", () => {
      const r = evaluateRisk(input({ signal: signal({ heartRate: 105 }) }));
      expect(r.riskScore).toBe(2);
      expect(r.reasons).toEqual(["Heart rate is 40% above personal baseline."]);
    });
    it("≥70% scores +3 total", () => {
      expect(evaluateRisk(input({ signal: signal({ heartRate: 128 }) })).riskScore).toBe(3); // 70.7%
    });
    it("145 vs 75 reads as 93%", () => {
      expect(heartRateIncreasePct(145, 75)).toBe(93);
      expect(evaluateRisk(input({ signal: signal({ heartRate: 145 }) })).reasons[0]).toBe(
        "Heart rate is 93% above personal baseline.",
      );
    });
    it("ignores a missing baseline", () => {
      expect(heartRateIncreasePct(145, undefined)).toBeNull();
      expect(evaluateRisk(input({ signal: signal({ heartRate: 145, baselineHeartRate: undefined }) })).riskScore).toBe(0);
    });
  });

  it("unexpected running scores +2 once (activity or rapid movement)", () => {
    expect(evaluateRisk(input({ signal: signal({ activity: "running", movementState: "rapid" }) })).riskScore).toBe(2);
    expect(evaluateRisk(input({ signal: signal({ movementState: "rapid" }) })).riskScore).toBe(2);
  });

  it("route deviation >200m scores +1; on route / slightly off score nothing", () => {
    expect(evaluateRisk(input({ routeStatus: route("on_route", 20) })).riskScore).toBe(0);
    expect(evaluateRisk(input({ routeStatus: route("slightly_off", 150) })).riskScore).toBe(0);
    const r = evaluateRisk(input({ routeStatus: route("deviation", 260) }));
    expect(r.riskScore).toBe(1);
    expect(r.reasons).toEqual(["About 260 m away from the planned route."]);
    // Clearly off the planned path is enough for a check-in on its own.
    const off = evaluateRisk(input({ routeStatus: route("significant_deviation", 400) }));
    expect(off.riskScore).toBe(3);
    expect(off.recommendedAction).toBe("send_checkin");
    expect(off.reasons).toEqual(["About 400 m off the planned path."]);
  });

  it("sudden stop after rapid movement scores +2 (not without prior rapid movement)", () => {
    const stopped = signal({ activity: "stationary", movementState: "stopped" });
    expect(evaluateRisk(input({ signal: stopped, previousMovementState: "rapid" })).riskScore).toBe(2);
    expect(evaluateRisk(input({ signal: stopped, previousMovementState: "normal" })).riskScore).toBe(0);
  });

  it("fall simulation scores +3", () => {
    expect(evaluateRisk(input({ signal: signal({ activity: "fall_simulated", movementState: "stopped" }) })).riskScore).toBe(3);
  });

  it("no check-in response scores +3", () => {
    expect(evaluateRisk(input({ checkInUnanswered: true })).riskScore).toBe(3);
  });

  it("separated from group scores +1", () => {
    expect(evaluateRisk(input({ separatedFromGroup: true })).riskScore).toBe(1);
  });

  describe("thresholds", () => {
    const at = (score: number) => {
      // Build an exact score from +1 (separated), +1 (deviation), +3 (no response), +3 (fall).
      const parts: Partial<RiskInput> = {};
      let rest = score;
      if (rest >= 3) {
        parts.checkInUnanswered = true;
        rest -= 3;
      }
      if (rest >= 3) {
        parts.signal = signal({ activity: "fall_simulated", movementState: "stopped" });
        rest -= 3;
      }
      if (rest >= 1) {
        parts.separatedFromGroup = true;
        rest -= 1;
      }
      if (rest >= 1) {
        parts.routeStatus = route("deviation", 250);
        rest -= 1;
      }
      const result = evaluateRisk(input(parts));
      expect(result.riskScore).toBe(score);
      return result;
    };

    it.each([
      [0, "low", "continue_monitoring"],
      [1, "low", "continue_monitoring"],
      [2, "low", "continue_monitoring"],
      [3, "moderate", "send_checkin"],
      [4, "moderate", "send_checkin"],
      [5, "moderate", "notify_group"],
      [6, "moderate", "notify_group"],
      [7, "high", "start_ai_call"],
      [8, "high", "start_ai_call"],
    ] as const)("score %i → %s / %s", (score, severity, action) => {
      const r = at(score);
      expect(r.severity).toBe(severity);
      expect(r.recommendedAction).toBe(action);
    });
  });

  it("sanity: 145 vs 75 + running + deviation = 6 (group alert); unanswered check-in → 9 (escalate)", () => {
    const base = input({
      signal: signal({ heartRate: 145, activity: "running", movementState: "rapid" }),
      routeStatus: route("deviation", 260),
    });
    const six = evaluateRisk(base);
    expect(six.riskScore).toBe(6);
    expect(six.recommendedAction).toBe("notify_group");
    expect(six.reasons).toEqual([
      "Heart rate is 93% above personal baseline.",
      "Unexpected running detected.",
      "About 260 m away from the planned route.",
    ]);

    const nine = evaluateRisk({ ...base, checkInUnanswered: true });
    expect(nine.riskScore).toBe(9);
    expect(nine.severity).toBe("high");
    expect(nine.recommendedAction).toBe("start_ai_call");
  });

  it("is deterministic", () => {
    const i = input({ signal: signal({ heartRate: 145 }), checkInUnanswered: true });
    expect(evaluateRisk(i)).toEqual(evaluateRisk(i));
  });
});

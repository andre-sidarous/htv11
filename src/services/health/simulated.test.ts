import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthSignal } from "@/lib/types";
import { evaluateRisk } from "@/services/risk/engine";
import { createSimulatedHealthProvider, HEALTH_SCENARIOS, heartRateFor, scenarioFromSignal, signalFor } from "./simulated";

describe("SimulatedHealthProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("measures a resting baseline between 65 and 90 BPM", async () => {
    for (const r of [0, 0.5, 0.999]) {
      const provider = createSimulatedHealthProvider({ random: () => r });
      const promise = provider.measureBaseline({ durationMs: 1_000 });
      await vi.advanceTimersByTimeAsync(1_200);
      const bpm = await promise;
      expect(bpm).toBeGreaterThanOrEqual(65);
      expect(bpm).toBeLessThanOrEqual(90);
      expect(provider.getBaseline()).toBe(bpm);
    }
  });

  it("streams simulated signals and re-emits immediately on scenario change", () => {
    const provider = createSimulatedHealthProvider({ intervalMs: 3_000 });
    const signals: HealthSignal[] = [];
    const stop = provider.stream({ jamId: "j", userId: "u", baselineHeartRate: 75, onSignal: (s) => signals.push(s) });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ source: "simulated", activity: "walking", movementState: "normal", baselineHeartRate: 75 });

    provider.setScenario("u", "unexpected_running");
    expect(signals.at(-1)).toMatchObject({ heartRate: 145, activity: "running", movementState: "rapid" });

    vi.advanceTimersByTime(3_000);
    expect(signals).toHaveLength(3);
    stop();
    vi.advanceTimersByTime(9_000);
    expect(signals).toHaveLength(3);
  });

  it("Demo Mode baseline override wins", () => {
    const provider = createSimulatedHealthProvider();
    provider.setBaselineOverride(75);
    const signals: HealthSignal[] = [];
    const stop = provider.stream({ jamId: "j", userId: "u", baselineHeartRate: 88, onSignal: (s) => signals.push(s) });
    expect(signals[0]!.baselineHeartRate).toBe(75);
    stop();
  });
});

describe("scenario helpers", () => {
  it("spike at baseline 75 is 145 BPM", () => {
    expect(heartRateFor("heart_rate_spike", 75)).toBe(145);
  });

  it("round-trips every scenario through a broadcast signal", () => {
    for (const scenario of HEALTH_SCENARIOS) {
      for (const baseline of [65, 75, 90]) {
        const signal = signalFor({ jamId: "j", userId: "u", scenario, baselineHeartRate: baseline });
        expect(scenarioFromSignal(signal)).toBe(scenario);
      }
    }
  });

  it("spike + running scores 5 in the risk engine (no route input)", () => {
    const signal = signalFor({ jamId: "j", userId: "u", scenario: "unexpected_running", baselineHeartRate: 75 });
    expect(evaluateRisk({ signal, separatedFromGroup: false, checkInUnanswered: false }).riskScore).toBe(5);
  });
});

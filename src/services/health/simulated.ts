import type { Activity, HealthScenario, HealthService, HealthSignal, MovementState } from "@/lib/types";

/**
 * SimulatedHealthProvider: a fake wearable for the prototype. Every signal is `source: "simulated"`,
 * and the UI must always say "Simulated wearable data." No medical questions, no diagnosis.
 */

export const HEALTH_SCENARIOS: readonly HealthScenario[] = [
  "normal_walking",
  "heart_rate_spike",
  "unexpected_running",
  "sudden_stop",
  "fall_simulated",
  "no_response",
  "safe_again",
];

/** Each scenario mapped onto the shared enums. `hrPct` = % above the personal baseline. */
export const SCENARIO_SHAPE: Record<HealthScenario, { hrPct: number; activity: Activity; movementState: MovementState }> = {
  normal_walking: { hrPct: 8, activity: "walking", movementState: "normal" },
  // 75 → 145 BPM, the demo's "93% above personal baseline".
  heart_rate_spike: { hrPct: 93, activity: "walking", movementState: "normal" },
  unexpected_running: { hrPct: 93, activity: "running", movementState: "rapid" },
  sudden_stop: { hrPct: 72, activity: "stationary", movementState: "stopped" },
  fall_simulated: { hrPct: 60, activity: "fall_simulated", movementState: "stopped" },
  no_response: { hrPct: 50, activity: "stationary", movementState: "stopped" },
  safe_again: { hrPct: 4, activity: "walking", movementState: "normal" },
};

export const BASELINE_RANGE = { min: 65, max: 90 } as const;
export const HEALTH_STREAM_INTERVAL_MS = 3_000;

export function heartRateFor(scenario: HealthScenario, baseline: number): number {
  return Math.round(baseline * (1 + SCENARIO_SHAPE[scenario].hrPct / 100));
}

export function signalFor(input: {
  jamId: string;
  userId: string;
  scenario: HealthScenario;
  baselineHeartRate: number;
  now?: number;
}): HealthSignal {
  const shape = SCENARIO_SHAPE[input.scenario];
  return {
    jamId: input.jamId,
    userId: input.userId,
    heartRate: heartRateFor(input.scenario, input.baselineHeartRate),
    baselineHeartRate: input.baselineHeartRate,
    activity: shape.activity,
    movementState: shape.movementState,
    source: "simulated",
    timestamp: new Date(input.now ?? Date.now()).toISOString(),
  };
}

/**
 * Recover the scenario from a broadcast signal (demo actions on another phone broadcast a
 * `health_update` for the affected user; that phone adopts it). Matches activity + movement,
 * then the nearest heart-rate offset.
 */
export function scenarioFromSignal(signal: HealthSignal): HealthScenario {
  const pct =
    signal.heartRate && signal.baselineHeartRate
      ? ((signal.heartRate - signal.baselineHeartRate) / signal.baselineHeartRate) * 100
      : 0;
  const candidates = HEALTH_SCENARIOS.filter(
    (s) => SCENARIO_SHAPE[s].activity === signal.activity && SCENARIO_SHAPE[s].movementState === signal.movementState,
  );
  const pool = candidates.length ? candidates : HEALTH_SCENARIOS;
  return pool.reduce((best, s) =>
    Math.abs(SCENARIO_SHAPE[s].hrPct - pct) < Math.abs(SCENARIO_SHAPE[best].hrPct - pct) ? s : best,
  );
}

export type SimulatedHealthProvider = HealthService & {
  getScenario(userId: string): HealthScenario;
  /** Demo Mode override (campusWalk.health.baselineHeartRate). `null` clears it. */
  setBaselineOverride(bpm: number | null): void;
  /** The override, else the last measured baseline, else null. */
  getBaseline(): number | null;
  /** Listen for scenario changes (e.g. to show the current state in the UI). */
  onScenarioChange(listener: (userId: string, scenario: HealthScenario) => void): () => void;
};

export function createSimulatedHealthProvider(options: { random?: () => number; intervalMs?: number } = {}): SimulatedHealthProvider {
  const random = options.random ?? Math.random;
  const intervalMs = options.intervalMs ?? HEALTH_STREAM_INTERVAL_MS;
  const scenarios = new Map<string, HealthScenario>();
  const emitters = new Map<string, Set<() => void>>();
  const listeners = new Set<(userId: string, scenario: HealthScenario) => void>();
  let measured: number | null = null;
  let override: number | null = null;

  return {
    measureBaseline({ durationMs = 5_000, onProgress } = {}) {
      return new Promise((resolve) => {
        const started = Date.now();
        const timer = setInterval(() => {
          const fraction = Math.min(1, (Date.now() - started) / durationMs);
          onProgress?.(fraction);
          if (fraction >= 1) {
            clearInterval(timer);
            measured = BASELINE_RANGE.min + Math.round(random() * (BASELINE_RANGE.max - BASELINE_RANGE.min));
            resolve(measured);
          }
        }, Math.min(200, durationMs));
      });
    },

    stream({ jamId, userId, baselineHeartRate, onSignal }) {
      const emit = () =>
        onSignal(
          signalFor({
            jamId,
            userId,
            scenario: scenarios.get(userId) ?? "normal_walking",
            baselineHeartRate: override ?? baselineHeartRate,
          }),
        );
      const set = emitters.get(userId) ?? new Set();
      emitters.set(userId, set);
      set.add(emit);
      emit();
      const timer = setInterval(emit, intervalMs);
      return () => {
        clearInterval(timer);
        set.delete(emit);
      };
    },

    setScenario(userId, scenario) {
      if (scenarios.get(userId) === scenario) return;
      scenarios.set(userId, scenario);
      listeners.forEach((l) => l(userId, scenario));
      // Emit right away so the change shows without waiting for the next tick.
      emitters.get(userId)?.forEach((emit) => emit());
    },

    getScenario: (userId) => scenarios.get(userId) ?? "normal_walking",
    setBaselineOverride(bpm) {
      override = bpm;
    },
    getBaseline: () => override ?? measured,
    onScenarioChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

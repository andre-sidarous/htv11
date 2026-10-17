import type { Activity, HealthScenario, HealthService, MovementState } from "@/lib/types";

/**
 * Minimal simulated wearable. P4 replaces this with the full SimulatedHealthProvider.
 * Always label the UI "Simulated wearable data."
 */
const scenarios = new Map<string, HealthScenario>();

const SCENARIO_SHAPE: Record<HealthScenario, { hrFactor: number; activity: Activity; movementState: MovementState }> = {
  normal_walking: { hrFactor: 1.15, activity: "walking", movementState: "normal" },
  heart_rate_spike: { hrFactor: 1.93, activity: "walking", movementState: "normal" },
  unexpected_running: { hrFactor: 1.93, activity: "running", movementState: "rapid" },
  sudden_stop: { hrFactor: 1.7, activity: "stationary", movementState: "stopped" },
  fall_simulated: { hrFactor: 1.6, activity: "fall_simulated", movementState: "stopped" },
  no_response: { hrFactor: 1.5, activity: "stationary", movementState: "stopped" },
  safe_again: { hrFactor: 1.1, activity: "walking", movementState: "normal" },
};

export const mockHealthService: HealthService = {
  measureBaseline({ durationMs = 5_000, onProgress } = {}) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const fraction = Math.min(1, (Date.now() - started) / durationMs);
        onProgress?.(fraction);
        if (fraction >= 1) {
          clearInterval(timer);
          resolve(65 + Math.round(Math.random() * 25));
        }
      }, 200);
    });
  },
  stream({ jamId, userId, baselineHeartRate, onSignal }) {
    const emit = () => {
      const shape = SCENARIO_SHAPE[scenarios.get(userId) ?? "normal_walking"];
      onSignal({
        jamId,
        userId,
        heartRate: Math.round(baselineHeartRate * shape.hrFactor),
        baselineHeartRate,
        activity: shape.activity,
        movementState: shape.movementState,
        source: "simulated",
        timestamp: new Date().toISOString(),
      });
    };
    emit();
    const timer = setInterval(emit, 3_000);
    return () => clearInterval(timer);
  },
  setScenario(userId, scenario) {
    scenarios.set(userId, scenario);
  },
};

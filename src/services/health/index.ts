import type { HealthService } from "@/lib/types";
import { createSimulatedHealthProvider, type SimulatedHealthProvider } from "./simulated";

/** The simulated wearable (both mock and live modes). Extra controls for P4's engine and demo actions. */
export const simulatedHealth: SimulatedHealthProvider = createSimulatedHealthProvider();

export const healthService: HealthService = simulatedHealth;

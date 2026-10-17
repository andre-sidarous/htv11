import type { HealthService } from "@/lib/types";
import { mockHealthService } from "./mock";

// P4: swap for SimulatedHealthProvider.
export const healthService: HealthService = mockHealthService;

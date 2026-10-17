import type { RiskService } from "@/lib/types";
import { mockRiskService } from "./mock";

// P4: swap for the real risk engine.
export const riskService: RiskService = mockRiskService;

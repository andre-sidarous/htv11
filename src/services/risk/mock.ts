import type { RiskService } from "@/lib/types";

/** Placeholder: always "monitor". P4 implements the real, unit-tested scoring. */
export const mockRiskService: RiskService = {
  evaluate: () => ({ riskScore: 0, severity: "low", reasons: [], recommendedAction: "continue_monitoring" }),
};

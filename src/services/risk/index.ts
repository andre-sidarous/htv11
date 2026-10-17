import type { RiskService } from "@/lib/types";
import { riskEngine } from "./engine";

export const riskService: RiskService = riskEngine;

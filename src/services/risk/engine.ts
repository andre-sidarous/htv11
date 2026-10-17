import { RISK_THRESHOLDS } from "@/lib/constants";
import type { RiskEvaluation, RiskInput, RiskService } from "@/lib/types";

/**
 * Explainable, deterministic risk scoring. Points are cumulative; reasons are plain language.
 * It flags a POSSIBLE need for support. It never diagnoses illness, intoxication, assault, or danger.
 */
export const RISK_POINTS = {
  heartRate40: 2,
  /** Extra on top of heartRate40 (≥70% = +3 total). */
  heartRate70: 1,
  unexpectedRunning: 2,
  routeDeviation: 1,
  suddenStop: 2,
  fall: 3,
  noCheckInResponse: 3,
  separated: 1,
} as const;

/** % above baseline, rounded, or null when there's no usable reading. */
export function heartRateIncreasePct(heartRate?: number, baseline?: number): number | null {
  if (!heartRate || !baseline || baseline <= 0) return null;
  return Math.round(((heartRate - baseline) / baseline) * 100);
}

export function evaluateRisk(input: RiskInput): RiskEvaluation {
  const { signal } = input;
  let score = 0;
  const reasons: string[] = [];

  const pct = heartRateIncreasePct(signal?.heartRate, signal?.baselineHeartRate);
  if (pct !== null && pct >= 40) {
    score += RISK_POINTS.heartRate40;
    if (pct >= 70) score += RISK_POINTS.heartRate70;
    reasons.push(`Heart rate is ${pct}% above personal baseline.`);
  }

  if (signal?.activity === "running" || signal?.movementState === "rapid") {
    score += RISK_POINTS.unexpectedRunning;
    reasons.push("Unexpected running detected.");
  }

  const level = input.routeStatus?.level;
  if (level === "deviation" || level === "significant_deviation") {
    score += RISK_POINTS.routeDeviation;
    reasons.push(`About ${Math.round(input.routeStatus!.distanceFromRouteM)} m away from the planned route.`);
  }

  if (input.previousMovementState === "rapid" && signal?.movementState === "stopped") {
    score += RISK_POINTS.suddenStop;
    reasons.push("Sudden stop after rapid movement.");
  }

  if (signal?.activity === "fall_simulated") {
    score += RISK_POINTS.fall;
    reasons.push("Possible fall detected (simulated).");
  }

  if (input.checkInUnanswered) {
    score += RISK_POINTS.noCheckInResponse;
    reasons.push("No response to the check-in.");
  }

  if (input.separatedFromGroup) {
    score += RISK_POINTS.separated;
    reasons.push("Separated from the group.");
  }

  if (score >= RISK_THRESHOLDS.escalate) {
    return { riskScore: score, severity: "high", reasons, recommendedAction: "start_ai_call" };
  }
  if (score >= RISK_THRESHOLDS.groupAlert) {
    return { riskScore: score, severity: "moderate", reasons, recommendedAction: "notify_group" };
  }
  if (score >= RISK_THRESHOLDS.checkIn) {
    return { riskScore: score, severity: "moderate", reasons, recommendedAction: "send_checkin" };
  }
  return { riskScore: score, severity: "low", reasons, recommendedAction: "continue_monitoring" };
}

export const riskEngine: RiskService = { evaluate: evaluateRisk };

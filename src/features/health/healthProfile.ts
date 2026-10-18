import { predictRisk, type Sex } from "./healthModel";

/** Pure health-profile pieces (no Expo imports, so they're unit-testable). */

/** The editable part of a health profile (what the sign-up step collects). */
export type HealthProfileInput = {
  age: number | null;
  sex: Sex | null;
  weightKg: number | null;
  heightCm: number | null;
  allergies: string[];
  carriesEpipen: boolean;
  conditions: string[];
  familyHistory: string[];
  isVulnerable: boolean;
  medicalCardPath: string | null;
};

export const EMPTY_HEALTH_PROFILE: HealthProfileInput = {
  age: null,
  sex: null,
  weightKg: null,
  heightCm: null,
  allergies: [],
  carriesEpipen: false,
  conditions: [],
  familyHistory: [],
  isVulnerable: false,
  medicalCardPath: null,
};

export const COMMON_ALLERGIES = ["Peanuts", "Tree nuts", "Shellfish", "Milk", "Eggs", "Bee stings", "Penicillin", "Latex"] as const;
export const CONDITIONS = ["Asthma", "Diabetes", "Heart condition", "High blood pressure", "Epilepsy"] as const;
export const FAMILY_HISTORY = ["Heart disease", "Diabetes", "Stroke", "High blood pressure"] as const;

/** The NHANES risk estimate for a profile, or null without an age. */
export function riskFor(p: HealthProfileInput) {
  if (!p.age) return null;
  return predictRisk({
    age: p.age,
    sex: p.sex ?? "unspecified",
    weightKg: p.weightKg,
    heightCm: p.heightCm,
    familyHeartDisease: p.familyHistory.includes("Heart disease"),
    familyDiabetes: p.familyHistory.includes("Diabetes"),
  });
}

import model from "./data/health-model.json";

/**
 * Health predictions from NHANES (CDC), trained by ml/train_health_model.py. Pure (no
 * react-native), so it's unit-tested and runs on the phone with no server.
 *
 *   restingRange(age, sex)  → normal resting heart rate for your age group (and the most common one)
 *   predictRisk(profile)    → chance of high blood pressure, diabetes or heart disease
 *
 * A risk estimate from population data, not a diagnosis.
 */

export type Sex = "female" | "male" | "unspecified";

export type RiskInput = {
  age: number;
  sex: Sex;
  /** kg and cm; when missing, an average BMI is used. */
  weightKg?: number | null;
  heightCm?: number | null;
  /** bpm; when missing, the typical resting rate for their age and sex is used. */
  restingHeartRate?: number | null;
  familyHeartDisease: boolean;
  familyDiabetes: boolean;
};

export type RestingRange = { low: number; typical: number; high: number; mostCommon: number; ageGroup: string };

export type RiskEstimate = {
  /** 0–1 */
  probability: number;
  percent: number;
  /** How common these conditions are for people their age and sex (0–1). */
  ageGroupRate: number;
  comparedToAge: "lower" | "about the same" | "higher";
  /** "28% chance of high blood pressure, diabetes or heart disease, about the same as people your age (31%)." */
  summary: string;
};

/** Population average BMI (NHANES adults), used when weight or height is missing. */
const AVERAGE_BMI = 29.5;

const clampAge = (age: number) => Math.min(80, Math.max(18, Math.round(age)));

function rowsFor<T extends { ageMin: number; ageMax: number; sex: string }>(rows: T[], age: number, sex: Sex): T[] {
  const a = clampAge(age);
  const band = rows.filter((r) => a >= r.ageMin && a <= r.ageMax);
  return sex === "unspecified" ? band : band.filter((r) => r.sex === sex);
}

const average = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

/** Normal resting heart rate for people your age and sex (10th–90th percentile, NHANES). */
export function restingRange(age: number, sex: Sex): RestingRange {
  const rows = rowsFor(model.restingHeartRate, age, sex);
  return {
    low: Math.round(average(rows.map((r) => r.p10))),
    typical: Math.round(average(rows.map((r) => r.p50))),
    high: Math.round(average(rows.map((r) => r.p90))),
    mostCommon: Math.round(average(rows.map((r) => r.mostCommon))),
    ageGroup: `${rows[0]?.ageMin ?? 18}–${rows[0]?.ageMax === 80 ? "80+" : (rows[0]?.ageMax ?? 80)}`,
  };
}

/** Above the normal range for their age (the top 10%). */
export const isHighForAge = (bpm: number, age: number, sex: Sex) => bpm > restingRange(age, sex).high;

export const bmiOf = (weightKg?: number | null, heightCm?: number | null) =>
  weightKg && heightCm && heightCm > 50 ? weightKg / (heightCm / 100) ** 2 : null;

export function predictRisk(input: RiskInput): RiskEstimate {
  const c = model.coefficients;
  const age = clampAge(input.age);
  const male = input.sex === "male" ? 1 : input.sex === "female" ? 0 : 0.5;
  const bmi = bmiOf(input.weightKg, input.heightCm) ?? AVERAGE_BMI;
  const hr = input.restingHeartRate ?? restingRange(age, input.sex).typical;
  const logit =
    model.intercept +
    c.age * age +
    c.male * male +
    c.bmi * bmi +
    c.resting_hr * hr +
    c.family_heart * (input.familyHeartDisease ? 1 : 0) +
    c.family_diabetes * (input.familyDiabetes ? 1 : 0);
  const probability = 1 / (1 + Math.exp(-logit));
  const ageGroupRate = average(rowsFor(model.prevalenceByAgeSex, age, input.sex).map((r) => r.rate));
  const percent = Math.round(probability * 100);
  const ratePct = Math.round(ageGroupRate * 100);
  const comparedToAge = percent >= ratePct + 8 ? "higher" : percent <= ratePct - 8 ? "lower" : "about the same";
  const comparison =
    comparedToAge === "about the same" ? `about the same as people your age (${ratePct}%)` : `${comparedToAge} than people your age (${ratePct}%)`;
  return {
    probability,
    percent,
    ageGroupRate,
    comparedToAge,
    summary: `${percent}% chance of high blood pressure, diabetes or heart disease, ${comparison}.`,
  };
}

/** For the "how this works" line: what the model was trained on and how well it does. */
export const modelInfo = {
  source: model.source,
  people: model.metrics.trainSize + model.metrics.testSize,
  auc: model.metrics.auc,
  accuracyPct: Math.round(model.metrics.accuracy * 100),
};

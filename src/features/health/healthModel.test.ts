import { describe, expect, it } from "vitest";
import { bmiOf, isHighForAge, modelInfo, predictRisk, restingRange } from "./healthModel";

const base = { familyHeartDisease: false, familyDiabetes: false } as const;

describe("restingRange (NHANES)", () => {
  it("gives a normal range and the most common resting rate for an age group", () => {
    const r = restingRange(24, "female");
    expect(r.ageGroup).toBe("18–29");
    expect(r.low).toBeLessThan(r.typical);
    expect(r.typical).toBeLessThan(r.high);
    expect(r.mostCommon).toBeGreaterThan(55);
    expect(r.mostCommon).toBeLessThan(90);
  });

  it("clamps ages and averages both sexes when unspecified", () => {
    expect(restingRange(95, "male").ageGroup).toBe("70–80+");
    const both = restingRange(40, "unspecified").typical;
    expect(both).toBeGreaterThanOrEqual(Math.min(restingRange(40, "male").typical, restingRange(40, "female").typical));
    expect(both).toBeLessThanOrEqual(Math.max(restingRange(40, "male").typical, restingRange(40, "female").typical));
  });

  it("flags a heart rate above the normal range for their age", () => {
    expect(isHighForAge(145, 24, "female")).toBe(true);
    expect(isHighForAge(70, 24, "female")).toBe(false);
  });
});

describe("predictRisk", () => {
  it("rises with age, BMI, resting heart rate and family history", () => {
    const young = predictRisk({ ...base, age: 22, sex: "female" }).probability;
    const older = predictRisk({ ...base, age: 65, sex: "female" }).probability;
    expect(older).toBeGreaterThan(young);
    const heavier = predictRisk({ ...base, age: 40, sex: "male", weightKg: 110, heightCm: 175 }).probability;
    const lighter = predictRisk({ ...base, age: 40, sex: "male", weightKg: 70, heightCm: 175 }).probability;
    expect(heavier).toBeGreaterThan(lighter);
    const fastHr = predictRisk({ ...base, age: 40, sex: "male", restingHeartRate: 95 }).probability;
    const slowHr = predictRisk({ ...base, age: 40, sex: "male", restingHeartRate: 60 }).probability;
    expect(fastHr).toBeGreaterThan(slowHr);
    const family = predictRisk({ age: 40, sex: "male", familyHeartDisease: true, familyDiabetes: true }).probability;
    expect(family).toBeGreaterThan(predictRisk({ ...base, age: 40, sex: "male" }).probability);
  });

  it("explains it in plain words, compared with people their age", () => {
    const r = predictRisk({ age: 30, sex: "female", weightKg: 130, heightCm: 160, familyHeartDisease: true, familyDiabetes: true });
    expect(r.summary).toMatch(/^\d+% chance of high blood pressure, diabetes or heart disease, higher than people your age \(\d+%\)\.$/);
    expect(r.comparedToAge).toBe("higher");
  });

  it("computes BMI only with both weight and height", () => {
    expect(bmiOf(70, 175)).toBeCloseTo(22.9, 1);
    expect(bmiOf(70, null)).toBeNull();
  });

  it("reports how the model was trained", () => {
    expect(modelInfo.people).toBeGreaterThan(5000);
    expect(modelInfo.auc).toBeGreaterThan(0.75);
  });
});

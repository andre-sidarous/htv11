import { describe, expect, it } from "vitest";
import { EMPTY_HEALTH_PROFILE } from "./healthProfile";
import { MEDICAL_PREFIX, medicalAlertLines, mergeReasons, withMedicalLines } from "./medicalAlert";

const profile = {
  ...EMPTY_HEALTH_PROFILE,
  age: 22,
  sex: "female" as const,
  conditions: ["Asthma"],
  familyHistory: ["Heart disease"],
  allergies: ["Peanuts"],
  carriesEpipen: true,
};

describe("medical lines for the group alert", () => {
  it("compares the heart rate with normal for their age and adds the profile and estimate", () => {
    const lines = medicalAlertLines(145, profile);
    expect(lines.every((l) => l.startsWith(MEDICAL_PREFIX))).toBe(true);
    expect(lines[0]).toMatch(/^Health: Heart rate 145 bpm, above normal for their age \(\d+–\d+ bpm\)\.$/);
    expect(lines).toContain("Health: They’ve listed asthma and a family history of heart disease.");
    expect(lines).toContain("Health: Allergic to peanuts (carries an EpiPen).");
    const estimate = lines.find((l) => l.includes("estimate"))!;
    expect(estimate).toMatch(/% chance of high blood pressure, diabetes or heart disease/);
    expect(estimate).toContain("their age");
    expect(estimate).not.toContain("your age");
  });

  it("falls back to their baseline without a profile", () => {
    expect(medicalAlertLines(140, null, 72)).toEqual(["Health: Heart rate 140 bpm, well above their usual 72 bpm."]);
  });

  it("keeps health lines through engine updates and replaces older ones", () => {
    const withHealth = withMedicalLines(["Off path."], medicalAlertLines(140, null, 72));
    expect(mergeReasons(withHealth, ["About 450 m off the planned path."])).toEqual([
      "About 450 m off the planned path.",
      "Health: Heart rate 140 bpm, well above their usual 72 bpm.",
    ]);
    expect(withMedicalLines(withHealth, ["Health: Heart rate 150 bpm."])).toEqual(["Off path.", "Health: Heart rate 150 bpm."]);
  });
});

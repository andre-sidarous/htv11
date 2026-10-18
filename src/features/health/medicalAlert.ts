import { restingRange, type Sex } from "./healthModel";
import { riskFor, type HealthProfileInput } from "./healthProfile";

/**
 * When the affected person's heart rate goes high during an open alert, their phone adds these
 * plain-language lines to the alert so the group sees them (only the person's own phone can read
 * their health profile). Every line starts with "Health:" so the risk engine's own reason updates
 * keep them (see mergeReasons). Pure, so it's unit-tested.
 */

export const MEDICAL_PREFIX = "Health: ";

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const joinAnd = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function medicalAlertLines(
  heartRate: number,
  profile: HealthProfileInput | null,
  baselineHeartRate?: number | null,
): string[] {
  const bpm = Math.round(heartRate);
  const range = profile?.age ? restingRange(profile.age, (profile.sex ?? "unspecified") as Sex) : null;
  const lines = [
    range
      ? `Heart rate ${bpm} bpm, above normal for their age (${range.low}–${range.high} bpm).`
      : baselineHeartRate
        ? `Heart rate ${bpm} bpm, well above their usual ${Math.round(baselineHeartRate)} bpm.`
        : `Heart rate ${bpm} bpm.`,
  ];
  if (profile) {
    const listed = [
      ...profile.conditions.map(lower),
      ...(profile.familyHistory.length ? [`a family history of ${joinAnd(profile.familyHistory.map(lower))}`] : []),
    ];
    if (listed.length) lines.push(`They’ve listed ${joinAnd(listed)}.`);
    if (profile.allergies.length) {
      lines.push(`Allergic to ${joinAnd(profile.allergies.map(lower))}${profile.carriesEpipen ? " (carries an EpiPen)" : ""}.`);
    }
    const risk = riskFor(profile);
    if (risk) lines.push(`Huddle’s estimate (CDC health survey data): ${risk.summary.replaceAll("your age", "their age")}`);
  }
  return lines.map((l) => MEDICAL_PREFIX + l);
}

export const isMedicalLine = (reason: unknown): reason is string => typeof reason === "string" && reason.startsWith(MEDICAL_PREFIX);

/** The engine's latest reasons, keeping any health lines already on the alert. */
export function mergeReasons(existing: unknown, next: string[]): string[] {
  const kept = (Array.isArray(existing) ? existing : []).filter(isMedicalLine);
  return [...next.filter((r) => !isMedicalLine(r)), ...kept];
}

/** The alert's reasons with these health lines replacing any older ones. */
export const withMedicalLines = (existing: unknown, lines: string[]): string[] => [
  ...(Array.isArray(existing) ? existing : []).filter((r): r is string => typeof r === "string" && !isMedicalLine(r)),
  ...lines,
];

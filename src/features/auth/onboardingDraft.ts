import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_CONSENTS } from "@/lib/constants";
import type { Consents, EmergencyPreference } from "@/lib/types";

/**
 * The consent screen and baseline screen run once, right after profile setup, and the choices
 * made there become the DEFAULT applied to every Jam the user creates or joins afterwards
 * (still editable per-Jam: Create Jam asks for emergency preference again, Join Jam reconfirms
 * location/health sharing, and Settings can change any of it later).
 *
 * This is on-device only (not synced to the account), which is fine for a prototype: it just
 * saves re-answering the same questions on every Jam.
 */
export type OnboardingDraft = {
  consents: Consents;
  emergencyPreference: EmergencyPreference | null;
  baselineHeartRate: number | null;
  completedAt: string | null;
};

export const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  consents: DEFAULT_CONSENTS,
  emergencyPreference: null,
  baselineHeartRate: null,
  completedAt: null,
};

const STORAGE_KEY = "jam:onboardingDraft:v1";

export async function loadOnboardingDraft(): Promise<OnboardingDraft> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ONBOARDING_DRAFT;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      consents: { ...DEFAULT_CONSENTS, ...parsed.consents },
      emergencyPreference: parsed.emergencyPreference ?? null,
      baselineHeartRate: parsed.baselineHeartRate ?? null,
      completedAt: parsed.completedAt ?? null,
    };
  } catch {
    return DEFAULT_ONBOARDING_DRAFT;
  }
}

export async function saveOnboardingDraft(draft: OnboardingDraft): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

/** A sensible fallback so screens never have to special-case "no baseline measured yet". */
export const FALLBACK_BASELINE_HEART_RATE = 72;

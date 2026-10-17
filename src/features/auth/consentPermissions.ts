import { requestRecordingPermissionsAsync } from "expo-audio";
import * as Location from "expo-location";
import type { ConsentKey } from "@/lib/types";

/**
 * OS permissions are requested here, once, when the matching consent turns on — never later.
 * P4 starts the AI call and recording automatically with no confirmation step, so by the time
 * an alert happens, every permission a consented member needs must already be granted.
 */
const REQUESTERS: Partial<Record<ConsentKey, () => Promise<boolean>>> = {
  location_consent: async () => (await Location.requestForegroundPermissionsAsync()).granted,
  recording_consent: async () => (await requestRecordingPermissionsAsync()).granted,
};

const DENIED_COPY: Partial<Record<ConsentKey, string>> = {
  location_consent: "Location access is off, so this stays off too. Turn it on for Huddle in your phone's Settings app, then try again.",
  recording_consent: "Microphone access is off, so this stays off too. Turn it on for Huddle in your phone's Settings app, then try again.",
};

/**
 * Call when a consent toggle is about to turn on. Returns `null` if it's fine to turn on
 * (granted, or no OS permission applies to this consent), or calm copy to show instead if the
 * OS permission was declined — the caller should keep that consent off in that case.
 */
export async function requestConsentPermission(key: ConsentKey): Promise<string | null> {
  const request = REQUESTERS[key];
  if (!request) return null;
  const granted = await request();
  return granted ? null : (DENIED_COPY[key] ?? "That permission is off. Turn it on in your phone's Settings app.");
}

import type { ConsentKey, EscalationState, RealtimeEventName } from "@/lib/types";

export const APP_NAME = "Jam";

// ---------- Realtime ----------

export const jamChannelName = (jamId: string) => `jam:${jamId}`;

export const REALTIME_EVENTS = [
  "location_update",
  "member_status",
  "health_update",
  "alert_created",
  "alert_updated",
  "checkin_requested",
  "ai_call_state",
  "incident_created",
] as const satisfies readonly RealtimeEventName[];

// ---------- Location timing ----------

/** Broadcast every 3-5s. */
export const LOCATION_BROADCAST_INTERVAL_MS = 4_000;
/** Upsert live_locations at most this often (or on significant change). */
export const LOCATION_DB_UPSERT_INTERVAL_MS = 10_000;
/** Movement that counts as "significant" and forces an early upsert. */
export const LOCATION_SIGNIFICANT_CHANGE_M = 10;
/** No update for 30s -> stale; 60s -> offline/unavailable. Never declare danger from staleness alone. */
export const PRESENCE_STALE_AFTER_MS = 30_000;
export const PRESENCE_OFFLINE_AFTER_MS = 60_000;

// ---------- Route deviation (metres) ----------

export const ROUTE_DEVIATION_M = {
  slightlyOff: 100,
  deviation: 200,
  significant: 350,
} as const;

// ---------- Risk ----------

export const RISK_THRESHOLDS = {
  /** 0-2 monitor, 3-4 check-in, 5-6 group alert, 7+ escalate */
  checkIn: 3,
  groupAlert: 5,
  escalate: 7,
} as const;

export const DEMO_CHECKIN_TIMEOUT_MS = 12_000;

// ---------- Escalation timing ----------
// check-in -> (buffer) group alert -> (jams.group_response_timeout_seconds) AI call
// -> (AI_CALL_SILENCE_TIMEOUT_MS of silence) call contacts + send the incident package

/** Default for profiles.checkin_buffer_seconds. Each person picks theirs at sign-up. */
export const DEFAULT_CHECKIN_BUFFER_S = 120;
/** Choices shown at sign-up (seconds). */
export const CHECKIN_BUFFER_CHOICES_S = [60, 120, 300, 600] as const;
/** The AI checks in again this often while the call is active. */
export const AI_CALL_CHECKIN_INTERVAL_MS = 15_000;
/** No speech or tap from the person for this long during the AI call escalates to contacts. */
export const AI_CALL_SILENCE_TIMEOUT_MS = 45_000;

// ---------- Escalation ----------

export const TERMINAL_ESCALATION_STATES = ["RESOLVED", "CANCELLED"] as const satisfies readonly EscalationState[];

// ---------- Consent ----------

export const CONSENT_KEYS = [
  "location_consent",
  "health_consent",
  "ai_call_consent",
  "recording_consent",
  "contact_notify_consent",
] as const satisfies readonly ConsentKey[];

export const DEFAULT_CONSENTS: Record<ConsentKey, boolean> = {
  location_consent: false,
  health_consent: false,
  ai_call_consent: false,
  recording_consent: false,
  contact_notify_consent: false,
};

// ---------- AI support call ----------

/** Scripted fallback. Must always work, even with no Gemini key. */
export const SUPPORT_CALL_SCRIPT = [
  "Hi, this is Jam. Your group could not reach you. Are you safe?",
  "Can you tap the button if you can hear me?",
  "I have not received a response. Your authorized contacts may be notified with your location and safety information.",
] as const;

// ---------- ntfy ----------

/** The only content ever published to ntfy. No health data, location, phone numbers, or recordings. */
export const NTFY_MESSAGE = {
  title: "Jam safety alert",
  message: "A Jam member may need support. Open the Jam app to view details.",
} as const;

// ---------- Incidents ----------

export const DEFAULT_INCIDENT_RETENTION_HOURS = 24;
export const RECORDINGS_BUCKET = "recordings";

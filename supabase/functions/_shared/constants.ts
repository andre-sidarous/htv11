// Copies of app constants needed server-side. Edge Functions can't import from src/,
// so KEEP IN SYNC with src/lib/constants/index.ts.

export const SUPPORT_CALL_SCRIPT = [
  "Hi, this is Jam. Your group could not reach you. Are you safe?",
  "Can you tap the button if you can hear me?",
  "I have not received a response. Your authorized contacts may be notified with your location and safety information.",
] as const;

/** The only content ever published to ntfy. No health data, location, phone numbers, or recordings. */
export const NTFY_MESSAGE = {
  title: "Jam safety alert",
  message: "A Jam member may need support. Open the Jam app to view details.",
} as const;

export const TERMINAL_ESCALATION_STATES = ["RESOLVED", "CANCELLED"];

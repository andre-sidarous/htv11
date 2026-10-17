// Copy of the escalation state machine for Edge Functions (Deno can't import src/).
// SOURCE OF TRUTH: src/features/health/escalation.ts. Edit there, then copy the block between
// BEGIN/END SHARED here verbatim. src/features/health/escalation.test.ts fails if they drift.

// Mirrors of the shared app types (src/lib/types/domain.ts).
export type EscalationState =
  | "MONITORING"
  | "CHECK_IN_SENT"
  | "USER_RESPONDED"
  | "GROUP_ALERT_SENT"
  | "GROUP_MEMBER_ACKNOWLEDGED"
  | "AI_CALL_STARTING"
  | "AI_CALL_ACTIVE"
  | "AI_CALL_USER_RESPONDED"
  | "AI_CALL_USER_UNRESPONSIVE"
  | "CONTACTS_NOTIFIED"
  | "RESOLVED"
  | "CANCELLED";
export type AlertStatus = "check_in" | "group_alert" | "ai_call" | "contacts_notified" | "resolved";
export type CheckInResponse = "im_okay" | "changed_destination" | "im_lost" | "need_help" | "cannot_respond";
export type EmergencyPreference = "ai_support_call" | "contact_only_alert";

// ----- BEGIN SHARED (keep identical to supabase/functions/_shared/escalation.ts) -----

export type EscalationEvent =
  /** Risk reached the check-in threshold (or a manual check-in). */
  | { type: "CHECK_IN" }
  /** The affected user answered the "Are you okay?" sheet. */
  | { type: "CHECK_IN_RESPONSE"; response: CheckInResponse }
  /** A group member acknowledged the alert ("I'm going to help"). */
  | { type: "GROUP_ACK" }
  /** Start the AI support call now (demo / manual), instead of waiting for the group timeout. */
  | { type: "START_AI_CALL" }
  /** The support-call screen opened on the affected phone. */
  | { type: "AI_CALL_CONNECTED" }
  /** The user tapped "I can hear you" during the call. */
  | { type: "AI_CALL_RESPONSE" }
  /** The call script finished with no response. */
  | { type: "AI_CALL_NO_RESPONSE" }
  /** The incident package exists; contacts/members may now be told. */
  | { type: "NOTIFY_CONTACTS" }
  /** next_deadline_at passed (the caller checks that it's due). */
  | { type: "DEADLINE" }
  /** "I'm safe" / a member marked them safe. */
  | { type: "RESOLVE" }
  /** "Cancel escalation" (false alarm). */
  | { type: "CANCEL" };

export type EscalationEventType = EscalationEvent["type"];

export type EscalationConfig = {
  checkInTimeoutMs: number;
  groupResponseTimeoutMs: number;
  /** Backup deadline if the support-call screen never opens (e.g. the phone is closed). */
  aiCallConnectTimeoutMs: number;
  /** Backup deadline for the whole spoken script with no response. */
  aiCallResponseTimeoutMs: number;
  /** Time to build the incident package before CONTACTS_NOTIFIED. */
  incidentGraceMs: number;
  /** After "I'm okay", the alert auto-resolves after this long. */
  userRespondedGraceMs: number;
  /** False when emergency_preference is contact_only_alert or ai_call_consent is off. */
  aiCallAllowed: boolean;
};

export type EscalationResult = {
  state: EscalationState;
  status: AlertStatus;
  /** ISO time of the next timeout, or null when the state waits on a person. */
  deadlineAt: string | null;
  /** Set when the new state is terminal (DB check constraint requires it). */
  resolvedAt: string | null;
};

export const ESCALATION_TERMINAL_STATES: readonly EscalationState[] = ["RESOLVED", "CANCELLED"];

export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  checkInTimeoutMs: 12_000,
  groupResponseTimeoutMs: 15_000,
  aiCallConnectTimeoutMs: 10_000,
  // Backup only (the phone escalates itself after AI_CALL_SILENCE_TIMEOUT_MS of silence): long enough
  // for the three spoken lines plus that silence, so the server never cuts in mid-call.
  aiCallResponseTimeoutMs: 30_000,
  incidentGraceMs: 8_000,
  userRespondedGraceMs: 8_000,
  aiCallAllowed: true,
};

/** Build the config from the Jam's timers and the affected member's preference and consent. */
export function escalationConfigFor(input: {
  checkinDelaySeconds?: number | null;
  groupResponseTimeoutSeconds?: number | null;
  emergencyPreference?: EmergencyPreference | null;
  aiCallConsent?: boolean | null;
}): EscalationConfig {
  return {
    ...DEFAULT_ESCALATION_CONFIG,
    checkInTimeoutMs: (input.checkinDelaySeconds ?? 0) > 0
      ? input.checkinDelaySeconds! * 1000
      : DEFAULT_ESCALATION_CONFIG.checkInTimeoutMs,
    groupResponseTimeoutMs: (input.groupResponseTimeoutSeconds ?? 0) > 0
      ? input.groupResponseTimeoutSeconds! * 1000
      : DEFAULT_ESCALATION_CONFIG.groupResponseTimeoutMs,
    aiCallAllowed: input.emergencyPreference !== "contact_only_alert" && input.aiCallConsent === true,
  };
}

export function statusForState(state: EscalationState): AlertStatus {
  switch (state) {
    case "MONITORING":
    case "CHECK_IN_SENT":
    case "USER_RESPONDED":
      return "check_in";
    case "GROUP_ALERT_SENT":
    case "GROUP_MEMBER_ACKNOWLEDGED":
      return "group_alert";
    case "AI_CALL_STARTING":
    case "AI_CALL_ACTIVE":
    case "AI_CALL_USER_RESPONDED":
    case "AI_CALL_USER_UNRESPONSIVE":
      return "ai_call";
    case "CONTACTS_NOTIFIED":
      return "contacts_notified";
    case "RESOLVED":
    case "CANCELLED":
      return "resolved";
  }
}

export function isTerminalState(state: EscalationState): boolean {
  return ESCALATION_TERMINAL_STATES.includes(state);
}

/** Where to go when the group doesn't respond: the AI call, or straight to contacts. */
function afterGroup(config: EscalationConfig): EscalationState {
  return config.aiCallAllowed ? "AI_CALL_STARTING" : "CONTACTS_NOTIFIED";
}

function nextState(state: EscalationState, event: EscalationEvent, config: EscalationConfig): EscalationState | null {
  if (isTerminalState(state)) return null;
  if (event.type === "RESOLVE") return "RESOLVED";
  if (event.type === "CANCEL") return "CANCELLED";

  switch (state) {
    case "MONITORING":
      return event.type === "CHECK_IN" ? "CHECK_IN_SENT" : null;
    case "CHECK_IN_SENT":
      if (event.type === "CHECK_IN_RESPONSE") {
        return event.response === "im_okay" || event.response === "changed_destination"
          ? "USER_RESPONDED"
          : "GROUP_ALERT_SENT";
      }
      return event.type === "DEADLINE" ? "GROUP_ALERT_SENT" : null;
    case "USER_RESPONDED":
      return event.type === "DEADLINE" ? "RESOLVED" : null;
    case "GROUP_ALERT_SENT":
      if (event.type === "GROUP_ACK") return "GROUP_MEMBER_ACKNOWLEDGED";
      if (event.type === "DEADLINE") return afterGroup(config);
      if (event.type === "START_AI_CALL") return config.aiCallAllowed ? "AI_CALL_STARTING" : null;
      return null;
    case "GROUP_MEMBER_ACKNOWLEDGED":
      return null;
    case "AI_CALL_STARTING":
      return event.type === "AI_CALL_CONNECTED" || event.type === "DEADLINE" ? "AI_CALL_ACTIVE" : null;
    case "AI_CALL_ACTIVE":
      if (event.type === "AI_CALL_RESPONSE") return "AI_CALL_USER_RESPONDED";
      return event.type === "AI_CALL_NO_RESPONSE" || event.type === "DEADLINE" ? "AI_CALL_USER_UNRESPONSIVE" : null;
    case "AI_CALL_USER_RESPONDED":
      return null;
    case "AI_CALL_USER_UNRESPONSIVE":
      return event.type === "NOTIFY_CONTACTS" || event.type === "DEADLINE" ? "CONTACTS_NOTIFIED" : null;
    case "CONTACTS_NOTIFIED":
      return null;
    default:
      return null;
  }
}

function deadlineMsFor(state: EscalationState, config: EscalationConfig): number | null {
  switch (state) {
    case "CHECK_IN_SENT":
      return config.checkInTimeoutMs;
    case "USER_RESPONDED":
      return config.userRespondedGraceMs;
    case "GROUP_ALERT_SENT":
      return config.groupResponseTimeoutMs;
    case "AI_CALL_STARTING":
      return config.aiCallConnectTimeoutMs;
    case "AI_CALL_ACTIVE":
      return config.aiCallResponseTimeoutMs;
    case "AI_CALL_USER_UNRESPONSIVE":
      return config.incidentGraceMs;
    default:
      return null;
  }
}

/**
 * Pure transition: (state, event, now) => next. Returns null for an invalid transition
 * (including anything from a terminal state), so callers can treat it as a no-op.
 */
export function transition(
  state: EscalationState,
  event: EscalationEvent,
  now: number,
  config: EscalationConfig = DEFAULT_ESCALATION_CONFIG,
): EscalationResult | null {
  const next = nextState(state, event, config);
  if (!next) return null;
  const delay = deadlineMsFor(next, config);
  return {
    state: next,
    status: statusForState(next),
    deadlineAt: delay === null ? null : new Date(now + delay).toISOString(),
    resolvedAt: isTerminalState(next) ? new Date(now).toISOString() : null,
  };
}

// ----- END SHARED -----

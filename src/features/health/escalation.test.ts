import { describe, expect, it } from "vitest";
import type { EscalationState } from "@/lib/types";
import {
  DEFAULT_ESCALATION_CONFIG,
  escalationConfigFor,
  isTerminalState,
  statusForState,
  transition,
  type EscalationConfig,
  type EscalationEvent,
} from "./escalation";
import appCopy from "./escalation.ts?raw";
import edgeCopy from "../../../supabase/functions/_shared/escalation.ts?raw";

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();
const noAi: EscalationConfig = { ...DEFAULT_ESCALATION_CONFIG, aiCallAllowed: false };
const C = DEFAULT_ESCALATION_CONFIG;

const ALL_STATES: EscalationState[] = [
  "MONITORING",
  "CHECK_IN_SENT",
  "USER_RESPONDED",
  "GROUP_ALERT_SENT",
  "GROUP_MEMBER_ACKNOWLEDGED",
  "AI_CALL_STARTING",
  "AI_CALL_ACTIVE",
  "AI_CALL_USER_RESPONDED",
  "AI_CALL_USER_UNRESPONSIVE",
  "CONTACTS_NOTIFIED",
  "RESOLVED",
  "CANCELLED",
];

const ALL_EVENTS: EscalationEvent[] = [
  { type: "CHECK_IN" },
  { type: "CHECK_IN_RESPONSE", response: "im_okay" },
  { type: "CHECK_IN_RESPONSE", response: "changed_destination" },
  { type: "CHECK_IN_RESPONSE", response: "im_lost" },
  { type: "CHECK_IN_RESPONSE", response: "need_help" },
  { type: "CHECK_IN_RESPONSE", response: "cannot_respond" },
  { type: "GROUP_ACK" },
  { type: "START_AI_CALL" },
  { type: "AI_CALL_CONNECTED" },
  { type: "AI_CALL_RESPONSE" },
  { type: "AI_CALL_NO_RESPONSE" },
  { type: "NOTIFY_CONTACTS" },
  { type: "DEADLINE" },
  { type: "RESOLVE" },
  { type: "CANCEL" },
];

const key = (e: EscalationEvent) => (e.type === "CHECK_IN_RESPONSE" ? `${e.type}:${e.response}` : e.type);

/** Every valid (state, event) → [next state, deadline offset or null], with AI calls allowed. */
const VALID: Record<string, [EscalationState, number | null]> = {
  "MONITORING|CHECK_IN": ["CHECK_IN_SENT", C.checkInTimeoutMs],

  "CHECK_IN_SENT|CHECK_IN_RESPONSE:im_okay": ["USER_RESPONDED", C.userRespondedGraceMs],
  "CHECK_IN_SENT|CHECK_IN_RESPONSE:changed_destination": ["USER_RESPONDED", C.userRespondedGraceMs],
  "CHECK_IN_SENT|CHECK_IN_RESPONSE:im_lost": ["GROUP_ALERT_SENT", C.groupResponseTimeoutMs],
  "CHECK_IN_SENT|CHECK_IN_RESPONSE:need_help": ["GROUP_ALERT_SENT", C.groupResponseTimeoutMs],
  "CHECK_IN_SENT|CHECK_IN_RESPONSE:cannot_respond": ["GROUP_ALERT_SENT", C.groupResponseTimeoutMs],
  "CHECK_IN_SENT|DEADLINE": ["GROUP_ALERT_SENT", C.groupResponseTimeoutMs],

  "USER_RESPONDED|DEADLINE": ["RESOLVED", null],

  "GROUP_ALERT_SENT|GROUP_ACK": ["GROUP_MEMBER_ACKNOWLEDGED", C.groupResponseTimeoutMs],
  "GROUP_ALERT_SENT|DEADLINE": ["AI_CALL_STARTING", C.aiCallConnectTimeoutMs],
  "GROUP_ALERT_SENT|START_AI_CALL": ["AI_CALL_STARTING", C.aiCallConnectTimeoutMs],
  "GROUP_MEMBER_ACKNOWLEDGED|START_AI_CALL": ["AI_CALL_STARTING", C.aiCallConnectTimeoutMs],
  "GROUP_MEMBER_ACKNOWLEDGED|DEADLINE": ["AI_CALL_STARTING", C.aiCallConnectTimeoutMs],

  "AI_CALL_STARTING|AI_CALL_CONNECTED": ["AI_CALL_ACTIVE", C.aiCallResponseTimeoutMs],
  "AI_CALL_STARTING|DEADLINE": ["AI_CALL_ACTIVE", C.aiCallResponseTimeoutMs],

  "AI_CALL_ACTIVE|AI_CALL_RESPONSE": ["AI_CALL_USER_RESPONDED", null],
  "AI_CALL_ACTIVE|AI_CALL_NO_RESPONSE": ["AI_CALL_USER_UNRESPONSIVE", C.incidentGraceMs],
  "AI_CALL_ACTIVE|DEADLINE": ["AI_CALL_USER_UNRESPONSIVE", C.incidentGraceMs],

  "AI_CALL_USER_UNRESPONSIVE|NOTIFY_CONTACTS": ["CONTACTS_NOTIFIED", null],
  "AI_CALL_USER_UNRESPONSIVE|DEADLINE": ["CONTACTS_NOTIFIED", null],
};

// RESOLVE and CANCEL are valid from every non-terminal state.
for (const state of ALL_STATES.filter((s) => !isTerminalState(s))) {
  VALID[`${state}|RESOLVE`] = ["RESOLVED", null];
  VALID[`${state}|CANCEL`] = ["CANCELLED", null];
}

describe("escalation transition()", () => {
  for (const state of ALL_STATES) {
    for (const event of ALL_EVENTS) {
      const k = `${state}|${key(event)}`;
      const expected = VALID[k];
      if (expected) {
        it(`valid: ${k} → ${expected[0]}`, () => {
          const result = transition(state, event, NOW);
          expect(result).not.toBeNull();
          expect(result!.state).toBe(expected[0]);
          expect(result!.status).toBe(statusForState(expected[0]));
          expect(result!.deadlineAt).toBe(expected[1] === null ? null : at(expected[1]));
          expect(result!.resolvedAt).toBe(isTerminalState(expected[0]) ? at(0) : null);
        });
      } else {
        it(`invalid: ${k}`, () => {
          expect(transition(state, event, NOW)).toBeNull();
        });
      }
    }
  }

  it("follows the full flow to CONTACTS_NOTIFIED", () => {
    const steps: EscalationEvent["type"][] = ["CHECK_IN", "DEADLINE", "DEADLINE", "AI_CALL_CONNECTED", "AI_CALL_NO_RESPONSE", "NOTIFY_CONTACTS"];
    let state: EscalationState = "MONITORING";
    const seen: EscalationState[] = [];
    for (const type of steps) {
      state = transition(state, { type } as EscalationEvent, NOW)!.state;
      seen.push(state);
    }
    expect(seen).toEqual([
      "CHECK_IN_SENT",
      "GROUP_ALERT_SENT",
      "AI_CALL_STARTING",
      "AI_CALL_ACTIVE",
      "AI_CALL_USER_UNRESPONSIVE",
      "CONTACTS_NOTIFIED",
    ]);
  });

  describe("contact_only_alert / no AI consent skips the AI call", () => {
    it("group timeout goes straight to CONTACTS_NOTIFIED", () => {
      expect(transition("GROUP_ALERT_SENT", { type: "DEADLINE" }, NOW, noAi)).toEqual({
        state: "CONTACTS_NOTIFIED",
        status: "contacts_notified",
        deadlineAt: null,
        resolvedAt: null,
      });
    });
    it("START_AI_CALL is rejected", () => {
      expect(transition("GROUP_ALERT_SENT", { type: "START_AI_CALL" }, NOW, noAi)).toBeNull();
    });
    it("a helper on the way just waits (no deadline, no call)", () => {
      expect(transition("GROUP_ALERT_SENT", { type: "GROUP_ACK" }, NOW, noAi)!.deadlineAt).toBeNull();
      expect(transition("GROUP_MEMBER_ACKNOWLEDGED", { type: "DEADLINE" }, NOW, noAi)).toBeNull();
      expect(transition("GROUP_MEMBER_ACKNOWLEDGED", { type: "START_AI_CALL" }, NOW, noAi)).toBeNull();
    });
  });

  it("maps every state to the matching alerts.status", () => {
    expect(ALL_STATES.map(statusForState)).toEqual([
      "check_in",
      "check_in",
      "check_in",
      "group_alert",
      "group_alert",
      "ai_call",
      "ai_call",
      "ai_call",
      "ai_call",
      "contacts_notified",
      "resolved",
      "resolved",
    ]);
  });
});

describe("escalationConfigFor()", () => {
  it("uses the Jam's timers and respects preference + consent", () => {
    const config = escalationConfigFor({
      checkinDelaySeconds: 20,
      groupResponseTimeoutSeconds: 30,
      emergencyPreference: "ai_support_call",
      aiCallConsent: true,
    });
    expect(config.checkInTimeoutMs).toBe(20_000);
    expect(config.groupResponseTimeoutMs).toBe(30_000);
    expect(config.aiCallAllowed).toBe(true);
  });

  it("falls back to demo timers and disallows the AI call without consent", () => {
    const config = escalationConfigFor({ emergencyPreference: null, aiCallConsent: false });
    expect(config.checkInTimeoutMs).toBe(DEFAULT_ESCALATION_CONFIG.checkInTimeoutMs);
    expect(config.aiCallAllowed).toBe(false);
    expect(escalationConfigFor({ emergencyPreference: "contact_only_alert", aiCallConsent: true }).aiCallAllowed).toBe(false);
  });
});

describe("Edge Function copy", () => {
  const shared = (text: string) => {
    const start = text.indexOf("// ----- BEGIN SHARED");
    const end = text.indexOf("// ----- END SHARED -----");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return text.slice(start, end);
  };

  it("supabase/functions/_shared/escalation.ts matches src/features/health/escalation.ts", () => {
    expect(shared(edgeCopy)).toBe(shared(appCopy));
  });
});

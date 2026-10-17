import { campusWalk } from "@/lib/demo/campusWalk";
import { mockServicesEnabled } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase/client";
import { advanceAlert } from "@/lib/supabase/functions";
import type {
  AlertResponseKind,
  AlertRow,
  EmergencyPreference,
  EscalationState,
  HealthSignal,
  SafetyAlert,
} from "@/lib/types";
import {
  DEFAULT_ESCALATION_CONFIG,
  escalationConfigFor,
  transition,
  type EscalationConfig,
} from "./escalation";

/**
 * Persistence for alerts (Supabase through RLS, or in memory when mocks are on, so a single
 * device can run the whole flow). Every state change is compare-and-set on escalation_state.
 */

export type AlertInsert = Pick<
  AlertRow,
  "jam_id" | "affected_user_id" | "risk_score" | "severity" | "status" | "escalation_state" | "reasons" | "next_deadline_at"
>;

export type AlertPatch = Partial<
  Pick<AlertRow, "escalation_state" | "status" | "next_deadline_at" | "resolved_at" | "acknowledged_at" | "risk_score" | "severity" | "reasons">
>;

export type MemberPolicy = {
  isMember: boolean;
  emergencyPreference: EmergencyPreference | null;
  consents: { health: boolean; aiCall: boolean; recording: boolean; contactNotify: boolean };
  config: EscalationConfig;
};

export type CreateResult = { alert: AlertRow } | { duplicate: true } | { error: string };

export interface AlertRepository {
  listOpen(jamId: string): Promise<AlertRow[]>;
  get(id: string): Promise<AlertRow | null>;
  create(row: AlertInsert): Promise<CreateResult>;
  /** Compare-and-set: applies only if the row is still in `fromState`. Null if someone moved first. */
  update(id: string, fromState: EscalationState, patch: AlertPatch): Promise<AlertRow | null>;
  /** Server-side deadline tick (advance-alert). */
  advance(id: string): Promise<{ advanced: boolean; alert: AlertRow | null }>;
  policy(jamId: string, userId: string): Promise<MemberPolicy>;
  respond(alertId: string, userId: string, kind: AlertResponseKind): Promise<void>;
  /** Only call when the member has health consent (RLS rejects it otherwise). */
  saveHealthSignal(signal: HealthSignal): Promise<void>;
  displayName(userId: string): Promise<string | null>;
  /** Active co-members (excluding `exceptUserId`). */
  memberIds(jamId: string, exceptUserId: string): Promise<string[]>;
}

/** Realtime payload: ids and states only. Reasons stay in the RLS-protected row. */
export function toSafetyAlert(row: AlertRow): SafetyAlert {
  return {
    id: row.id,
    jamId: row.jam_id,
    affectedUserId: row.affected_user_id,
    riskScore: Number(row.risk_score),
    severity: row.severity,
    status: row.status,
    escalationState: row.escalation_state,
    reasons: [],
    createdAt: row.created_at,
    nextDeadlineAt: row.next_deadline_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
  };
}

// ---------- Supabase ----------

const ALERT_COLUMNS =
  "id, jam_id, affected_user_id, risk_score, severity, status, escalation_state, reasons, next_deadline_at, created_at, acknowledged_at, resolved_at";

const normalize = (row: AlertRow): AlertRow => ({ ...row, risk_score: Number(row.risk_score) });

function supabaseRepository(): AlertRepository {
  const db = () => {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase is not configured.");
    return client;
  };

  return {
    async listOpen(jamId) {
      const { data, error } = await db().from("alerts").select(ALERT_COLUMNS).eq("jam_id", jamId).is("resolved_at", null);
      if (error) throw new Error(error.message);
      return (data as AlertRow[]).map(normalize);
    },
    async get(id) {
      const { data } = await db().from("alerts").select(ALERT_COLUMNS).eq("id", id).maybeSingle();
      return data ? normalize(data as AlertRow) : null;
    },
    async create(row) {
      const { data, error } = await db().from("alerts").insert(row).select(ALERT_COLUMNS).single();
      if (error) return error.code === "23505" ? { duplicate: true } : { error: error.message };
      return { alert: normalize(data as AlertRow) };
    },
    async update(id, fromState, patch) {
      const { data, error } = await db()
        .from("alerts")
        .update(patch)
        .eq("id", id)
        .eq("escalation_state", fromState)
        .is("resolved_at", null)
        .select(ALERT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? normalize(data as AlertRow) : null;
    },
    async advance(id) {
      const { data } = await advanceAlert(id);
      if (!data?.advanced) return { advanced: false, alert: null };
      return { advanced: true, alert: await this.get(id) };
    },
    async policy(jamId, userId) {
      const [{ data: member }, { data: jam }] = await Promise.all([
        db()
          .from("jam_members")
          .select("emergency_preference, health_consent, ai_call_consent, recording_consent, contact_notify_consent, is_active")
          .eq("jam_id", jamId)
          .eq("user_id", userId)
          .maybeSingle(),
        db().from("jams").select("checkin_delay_seconds, group_response_timeout_seconds").eq("id", jamId).maybeSingle(),
      ]);
      return {
        isMember: Boolean(member?.is_active),
        emergencyPreference: member?.emergency_preference ?? null,
        consents: {
          health: member?.health_consent ?? false,
          aiCall: member?.ai_call_consent ?? false,
          recording: member?.recording_consent ?? false,
          contactNotify: member?.contact_notify_consent ?? false,
        },
        config: escalationConfigFor({
          checkinDelaySeconds: jam?.checkin_delay_seconds,
          groupResponseTimeoutSeconds: jam?.group_response_timeout_seconds,
          emergencyPreference: member?.emergency_preference,
          aiCallConsent: member?.ai_call_consent,
        }),
      };
    },
    async respond(alertId, userId, kind) {
      const { error } = await db().from("alert_responses").insert({ alert_id: alertId, user_id: userId, kind });
      if (error && error.code !== "23505") console.warn("[alerts] response insert failed", error.message);
    },
    async saveHealthSignal(signal) {
      const { error } = await db().from("health_signals").insert({
        jam_id: signal.jamId,
        user_id: signal.userId,
        heart_rate: signal.heartRate ?? null,
        baseline_heart_rate: signal.baselineHeartRate ?? null,
        activity: signal.activity ?? null,
        movement_state: signal.movementState ?? null,
        source: "simulated",
      });
      if (error) console.warn("[health] signal insert failed", error.message);
    },
    async displayName(userId) {
      const { data } = await db().from("member_profiles").select("display_name").eq("id", userId).maybeSingle();
      return data?.display_name ?? null;
    },
    async memberIds(jamId, exceptUserId) {
      const { data } = await db().from("jam_members").select("user_id").eq("jam_id", jamId).eq("is_active", true);
      return (data ?? []).map((m) => m.user_id).filter((id) => id !== exceptUserId);
    },
  };
}

// ---------- In memory (mock mode: one device) ----------

export function createMemoryRepository(options: { newId?: () => string; config?: EscalationConfig } = {}): AlertRepository {
  const rows = new Map<string, AlertRow>();
  let counter = 0;
  const newId = options.newId ?? (() => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`);
  const config = options.config ?? DEFAULT_ESCALATION_CONFIG;

  const open = (jamId: string) => [...rows.values()].filter((r) => r.jam_id === jamId && !r.resolved_at);

  return {
    async listOpen(jamId) {
      return open(jamId);
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async create(row) {
      if (open(row.jam_id).some((r) => r.affected_user_id === row.affected_user_id)) return { duplicate: true };
      const alert: AlertRow = {
        ...row,
        id: newId(),
        created_at: new Date().toISOString(),
        acknowledged_at: null,
        resolved_at: null,
      };
      rows.set(alert.id, alert);
      return { alert };
    },
    async update(id, fromState, patch) {
      const row = rows.get(id);
      if (!row || row.escalation_state !== fromState || row.resolved_at) return null;
      const next = { ...row, ...patch };
      rows.set(id, next);
      return next;
    },
    async advance(id) {
      const row = rows.get(id);
      if (!row || row.resolved_at || !row.next_deadline_at || Date.parse(row.next_deadline_at) > Date.now()) {
        return { advanced: false, alert: null };
      }
      const next = transition(row.escalation_state, { type: "DEADLINE" }, Date.now(), config);
      if (!next) return { advanced: false, alert: null };
      const alert = await this.update(id, row.escalation_state, {
        escalation_state: next.state,
        status: next.status,
        next_deadline_at: next.deadlineAt,
        ...(next.resolvedAt ? { resolved_at: next.resolvedAt } : {}),
      });
      return { advanced: Boolean(alert), alert };
    },
    async policy() {
      return {
        isMember: true,
        emergencyPreference: "ai_support_call",
        consents: { health: true, aiCall: true, recording: true, contactNotify: true },
        config,
      };
    },
    async respond() {},
    async saveHealthSignal() {},
    async displayName(userId) {
      return campusWalk.members.find((m) => m.userId === userId)?.displayName ?? null;
    },
    async memberIds(_jamId, exceptUserId) {
      return campusWalk.members.map((m) => m.userId).filter((id) => id !== exceptUserId);
    },
  };
}

export const alertRepository: AlertRepository = mockServicesEnabled ? createMemoryRepository() : supabaseRepository();

import { z } from "zod";
import type { RealtimeEventMap, RealtimeEventName } from "@/lib/types";

/**
 * Runtime validation for inbound Realtime payloads. The realtime service drops
 * anything that doesn't match, so a malformed broadcast never crashes a screen.
 */

const timestamp = z.string().min(1);
const id = z.string().min(1);

const escalationState = z.enum([
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
]);

export const locationUpdateSchema = z.object({
  jamId: id,
  userId: id,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  activity: z.string().optional(),
  timestamp,
});

export const routeStatusSchema = z.object({
  userId: id,
  distanceFromRouteM: z.number().nonnegative(),
  level: z.enum(["on_route", "slightly_off", "deviation", "significant_deviation"]),
  isDemoRoute: z.boolean(),
});

export const memberStatusSchema = z.object({
  jamId: id,
  userId: id,
  presence: z.enum(["live", "stale", "offline", "paused", "unavailable"]).optional(),
  routeStatus: routeStatusSchema.optional(),
  sharingEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
  timestamp,
});

export const healthSignalSchema = z.object({
  jamId: id,
  userId: id,
  heartRate: z.number().min(0).max(300).optional(),
  baselineHeartRate: z.number().min(0).max(300).optional(),
  activity: z.enum(["walking", "running", "stationary", "fall_simulated"]).optional(),
  movementState: z.enum(["normal", "rapid", "stopped"]).optional(),
  source: z.literal("simulated"),
  timestamp,
});

export const safetyAlertSchema = z.object({
  id,
  jamId: id,
  affectedUserId: id,
  riskScore: z.number().nonnegative(),
  severity: z.enum(["low", "moderate", "high"]),
  status: z.enum(["check_in", "group_alert", "ai_call", "contacts_notified", "resolved"]),
  escalationState,
  reasons: z.array(z.string()),
  createdAt: timestamp,
  nextDeadlineAt: z.string().nullable().optional(),
  acknowledgedAt: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  checkinResponse: z.enum(["im_okay", "changed_destination", "im_lost", "need_help", "cannot_respond"]).nullable().optional(),
});

export const checkInRequestedSchema = z.object({
  jamId: id,
  targetUserId: id.optional(),
  alertId: id.optional(),
  requestedBy: id,
  reason: z.enum(["risk", "group_manual"]),
  deadlineAt: z.string().optional(),
  timestamp,
});

export const aiCallStateSchema = z.object({
  jamId: id,
  alertId: id,
  userId: id,
  state: z.enum(["starting", "active", "user_responded", "user_unresponsive", "ended"]),
  scriptStep: z.number().int().nonnegative().optional(),
  utterance: z.string().max(500).optional(),
  recording: z.boolean(),
  timestamp,
});

export const incidentCreatedSchema = z.object({
  jamId: id,
  alertId: id,
  incidentId: id,
  affectedUserId: id,
  timestamp,
});

export const demoResetSchema = z.object({ jamId: id, requestedBy: id, timestamp });

export const realtimeEventSchemas = {
  location_update: locationUpdateSchema,
  member_status: memberStatusSchema,
  health_update: healthSignalSchema,
  alert_created: safetyAlertSchema,
  alert_updated: safetyAlertSchema,
  checkin_requested: checkInRequestedSchema,
  ai_call_state: aiCallStateSchema,
  incident_created: incidentCreatedSchema,
  demo_reset: demoResetSchema,
} satisfies { [E in RealtimeEventName]: z.ZodType<RealtimeEventMap[E]> };

export function parseRealtimeEvent<E extends RealtimeEventName>(
  event: E,
  payload: unknown,
): RealtimeEventMap[E] | null {
  const result = realtimeEventSchemas[event].safeParse(payload);
  return result.success ? (result.data as RealtimeEventMap[E]) : null;
}

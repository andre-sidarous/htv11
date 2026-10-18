import type {
  AiCallState,
  HealthSignal,
  LocationUpdate,
  MemberPresence,
  RouteStatus,
  SafetyAlert,
} from "./domain";

/**
 * Realtime Broadcast contract. One channel per Jam: `jam:{jamId}`.
 * Broadcast payloads travel over a public-but-unguessable channel in the POC,
 * so keep sensitive data (phone numbers, health history, recordings) OUT of them.
 */

export type MemberStatusEvent = {
  jamId: string;
  userId: string;
  presence?: MemberPresence;
  routeStatus?: RouteStatus;
  sharingEnabled?: boolean;
  isActive?: boolean;
  timestamp: string;
};

export type CheckInRequestedEvent = {
  jamId: string;
  /** Omit to check in with the whole group ("Check in with group"). */
  targetUserId?: string;
  alertId?: string;
  requestedBy: string;
  reason: "risk" | "group_manual";
  deadlineAt?: string;
  timestamp: string;
};

export type AiCallStateEvent = {
  jamId: string;
  alertId: string;
  userId: string;
  state: AiCallState;
  scriptStep?: number;
  utterance?: string;
  recording: boolean;
  timestamp: string;
};

export type IncidentCreatedEvent = {
  jamId: string;
  alertId: string;
  incidentId: string;
  affectedUserId: string;
  timestamp: string;
};

/** Demo Control "Reset demo": every phone clears its local alert / location / health state. */
export type DemoResetEvent = {
  jamId: string;
  requestedBy: string;
  timestamp: string;
};

/** Demo Control's automated story started/stopped: the affected phone uses the in-app AI call (visible when mirrored). */
export type DemoStoryEvent = {
  jamId: string;
  running: boolean;
  /** true = run the AI support call inside the app instead of ringing a real phone. */
  inAppCall: boolean;
  timestamp: string;
};

export type RealtimeEventMap = {
  location_update: LocationUpdate;
  member_status: MemberStatusEvent;
  health_update: HealthSignal;
  alert_created: SafetyAlert;
  alert_updated: SafetyAlert;
  checkin_requested: CheckInRequestedEvent;
  ai_call_state: AiCallStateEvent;
  incident_created: IncidentCreatedEvent;
  demo_reset: DemoResetEvent;
  demo_story: DemoStoryEvent;
};

export type RealtimeEventName = keyof RealtimeEventMap;

export type RealtimeHandler<E extends RealtimeEventName> = (payload: RealtimeEventMap[E]) => void;

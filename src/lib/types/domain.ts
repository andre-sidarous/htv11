/**
 * Shared domain contracts. FROZEN after foundation merges:
 * changes go through a small PR that tags the whole team. Adding new optional
 * fields or new types is fine; renaming or removing is not.
 */

// ---------- Enums (mirror the CHECK constraints in supabase/migrations) ----------

export type TravelMode = "walking" | "transit" | "mixed";
export type JamStatus = "waiting" | "active" | "ended";
export type MemberRole = "host" | "member";
export type EmergencyPreference = "ai_support_call" | "contact_only_alert";

export type Activity = "walking" | "running" | "stationary" | "fall_simulated";
export type MovementState = "normal" | "rapid" | "stopped";

export type Severity = "low" | "moderate" | "high";
export type AlertStatus = "check_in" | "group_alert" | "ai_call" | "contacts_notified" | "resolved";

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

export type AlertResponseKind = "seen" | "acknowledged" | "responding" | "safe";
export type ConfirmationStatus = "pending" | "confirmed" | "declined";
export type NotificationChannel = "ntfy" | "sms_preview" | "in_app" | "voice_call" | "sms";
export type NotificationStatus = "sent" | "skipped" | "failed";

export type MemberPresence = "live" | "stale" | "offline" | "paused" | "unavailable";

// ---------- Consent ----------

/** The five consents. All default to false; never pre-enable recording or contact notification. */
export type ConsentKey =
  | "location_consent"
  | "health_consent"
  | "ai_call_consent"
  | "recording_consent"
  | "contact_notify_consent";

export type Consents = Record<ConsentKey, boolean>;

// ---------- Location / routing ----------

export type LatLng = { latitude: number; longitude: number };

export type LocationUpdate = {
  jamId: string;
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  activity?: string;
  timestamp: string;
};

export type RouteStatus = {
  userId: string;
  distanceFromRouteM: number;
  level: "on_route" | "slightly_off" | "deviation" | "significant_deviation";
  isDemoRoute: boolean;
};

export type Route = {
  coordinates: LatLng[];
  distanceM: number;
  durationS: number;
  source: "osrm" | "demo";
  isDemoRoute: boolean;
};

export type SupportPoint = {
  id: string;
  name: string;
  category:
    | "library"
    | "community_centre"
    | "school"
    | "hospital"
    | "police"
    | "transit"
    | "washroom"
    | "public_space";
  latitude: number;
  longitude: number;
  openNow?: boolean;
  source: string;
};

/** Output of P3's support-aware route recommendation; reused by P5's incident screen. */
export type RouteRecommendation = {
  explanation: string;
  supportPoints: SupportPoint[];
  alternativeRoute: Route | null;
};

// ---------- Health ----------

export type HealthSignal = {
  jamId: string;
  userId: string;
  heartRate?: number;
  baselineHeartRate?: number;
  activity?: Activity;
  movementState?: MovementState;
  source: "simulated";
  timestamp: string;
};

/** States of P4's SimulatedHealthProvider. */
export type HealthScenario =
  | "normal_walking"
  | "heart_rate_spike"
  | "unexpected_running"
  | "sudden_stop"
  | "fall_simulated"
  | "no_response"
  | "safe_again";

// ---------- Risk / alerts ----------

export type RiskEvaluation = {
  riskScore: number;
  severity: Severity;
  reasons: string[];
  recommendedAction:
    | "continue_monitoring"
    | "send_checkin"
    | "notify_group"
    | "start_ai_call"
    | "notify_contacts";
};

/** Inputs for the risk engine. Route/separation come from P3; don't recompute geometry. */
export type RiskInput = {
  signal?: HealthSignal;
  previousMovementState?: MovementState;
  routeStatus?: RouteStatus;
  presence?: MemberPresence;
  separatedFromGroup: boolean;
  checkInUnanswered: boolean;
};

export type SafetyAlert = {
  id: string;
  jamId: string;
  affectedUserId: string;
  riskScore: number;
  severity: Severity;
  status: AlertStatus;
  escalationState: EscalationState;
  reasons: string[];
  createdAt: string;
  nextDeadlineAt?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  /** What they answered on the check-in ("I'm lost", ...). Null/absent = no answer yet. */
  checkinResponse?: CheckInResponse | null;
};

/** Migration 008: a member's planned path to their destination (jam_members.planned_route). */
export type PlannedRoute = {
  to: { latitude: number; longitude: number; name: string | null };
  /** [lat, lng] pairs, thinned. */
  coordinates: [number, number][];
  distanceM: number;
  durationS: number;
  isDemoRoute?: boolean;
  plannedAt: string;
};

export type CheckInResponse =
  | "im_okay"
  | "changed_destination"
  | "im_lost"
  | "need_help"
  | "cannot_respond";

// ---------- AI support call ----------

export type AiCallState = "starting" | "active" | "user_responded" | "user_unresponsive" | "ended";

/** Everything the model may see. Never include location history. */
export type AiCallContext = {
  displayName: string;
  locationSummary: string;
  routeDeviationLevel?: RouteStatus["level"];
  heartRateSummary?: string;
  activity?: Activity;
  nearestSupportPoint?: string;
  groupResponded: boolean;
  /** Where the Jam is heading, so the AI can guide them there. */
  destinationName?: string;
  /** P3's next spoken direction, e.g. "Turn left on Harbord Street, then walk 200 metres". */
  guidance?: string;
  /** P3's support-area line, e.g. "You're in an area with few public support points. The nearest is …". */
  supportNote?: string;
  /** "Your planned route is about 450 metres west, on Military Trail. Head west to rejoin it." */
  backToRoute?: string;
};

export type AiCallTurn = { text: string; source: "gemini" | "scripted"; step: number };

// ---------- Incidents / contacts / notifications ----------

/** Stored in incident_packages.recipients (jsonb array). */
export type IncidentRecipient =
  | { type: "member"; userId: string }
  | { type: "contact"; contactId: string };

export type IncidentPackage = {
  id: string;
  alertId: string;
  affectedUserId: string;
  locationSnapshot: (LatLng & { accuracy?: number; capturedAt: string }) | null;
  healthSummary: Record<string, unknown> | null;
  routeSummary: Record<string, unknown> | null;
  recordingUrl: string | null;
  recipients: IncidentRecipient[];
  retentionHours: number;
  expiresAt: string;
  deletedAt: string | null;
  createdAt: string;
};

export type NotificationResult = {
  channel: NotificationChannel;
  status: NotificationStatus;
  detail?: string;
};

export type SmsPreview = { contactId: string; to: string; body: string };

// ---------- Demo ----------

export type DemoAction = {
  id: string;
  label: string;
  owner: "map" | "health" | "alerts";
  run: () => Promise<void>;
};

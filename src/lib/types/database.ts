import type {
  Activity,
  AlertResponseKind,
  CheckInResponse,
  AlertStatus,
  ConfirmationStatus,
  EmergencyPreference,
  EscalationState,
  IncidentRecipient,
  JamStatus,
  MemberRole,
  MovementState,
  NotificationChannel,
  NotificationStatus,
  Severity,
  TravelMode,
} from "./domain";

/**
 * Row types that mirror supabase/migrations exactly (snake_case, as returned by PostgREST).
 * If the schema changes, update this file in the same PR.
 * Timestamps are ISO strings; numeric columns come back as numbers.
 */

export type ProfileRow = {
  id: string;
  display_name: string;
  phone_number: string | null;
  avatar_url: string | null;
  /** Seconds Jam waits for a check-in answer before alerting the group. Chosen at sign-up (30-1800, default 120). */
  checkin_buffer_seconds: number;
  created_at: string;
  updated_at: string;
};

export type JamRow = {
  id: string;
  host_id: string;
  name: string;
  join_code: string;
  ntfy_topic: string;
  destination_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  expected_arrival: string | null;
  travel_mode: TravelMode;
  checkin_delay_seconds: number;
  group_response_timeout_seconds: number;
  status: JamStatus;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

export type JamMemberRow = {
  id: string;
  jam_id: string;
  user_id: string;
  role: MemberRole;
  is_active: boolean;
  location_consent: boolean;
  health_consent: boolean;
  ai_call_consent: boolean;
  recording_consent: boolean;
  contact_notify_consent: boolean;
  emergency_preference: EmergencyPreference | null;
  joined_at: string;
  left_at: string | null;
  /** Migration 006: "I changed my destination" (overrides the Jam's destination for this member). */
  destination_name?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_updated_at?: string | null;
};

export type LiveLocationRow = {
  id: string;
  jam_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  activity: string | null;
  sharing_enabled: boolean;
  last_seen_at: string;
  created_at: string;
};

export type HealthSignalRow = {
  id: string;
  jam_id: string;
  user_id: string;
  heart_rate: number | null;
  baseline_heart_rate: number | null;
  activity: Activity | null;
  movement_state: MovementState | null;
  source: "simulated";
  created_at: string;
};

export type AlertRow = {
  id: string;
  jam_id: string;
  affected_user_id: string;
  risk_score: number;
  severity: Severity;
  status: AlertStatus;
  escalation_state: EscalationState;
  reasons: string[];
  next_deadline_at: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  /** Migration 006. What they answered on the check-in; null = no answer. */
  checkin_response?: CheckInResponse | null;
};

export type AlertResponseRow = {
  id: string;
  alert_id: string;
  user_id: string;
  kind: AlertResponseKind;
  created_at: string;
};

export type TrustedContactRow = {
  id: string;
  owner_user_id: string;
  name: string;
  relationship: string | null;
  phone_number: string | null;
  email: string | null;
  receive_location: boolean;
  receive_health_summary: boolean;
  receive_recording: boolean;
  confirmation_status: ConfirmationStatus;
  created_at: string;
};

export type IncidentPackageRow = {
  id: string;
  alert_id: string;
  affected_user_id: string;
  location_snapshot: Record<string, unknown> | null;
  health_summary: Record<string, unknown> | null;
  route_summary: Record<string, unknown> | null;
  recording_url: string | null;
  recipients: IncidentRecipient[];
  access_token_hash: string | null;
  retention_hours: number;
  expires_at: string;
  deleted_at: string | null;
  created_at: string;
};

export type NotificationEventRow = {
  id: string;
  jam_id: string;
  alert_id: string | null;
  channel: NotificationChannel;
  status: NotificationStatus;
  detail: string | null;
  created_at: string;
};

export type ChatMessageRow = {
  id: string;
  jam_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

/** View: co-members' public profile fields (no phone number). */
export type MemberProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

// ---------- supabase-js Database generic ----------

type TableDef<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow, "id" | "display_name">;
      jams: TableDef<JamRow, "host_id" | "name">;
      jam_members: TableDef<JamMemberRow, "jam_id" | "user_id">;
      live_locations: TableDef<LiveLocationRow, "jam_id" | "user_id" | "latitude" | "longitude">;
      health_signals: TableDef<HealthSignalRow, "jam_id" | "user_id">;
      alerts: TableDef<AlertRow, "jam_id" | "affected_user_id" | "severity" | "status">;
      alert_responses: TableDef<AlertResponseRow, "alert_id" | "user_id" | "kind">;
      trusted_contacts: TableDef<TrustedContactRow, "owner_user_id" | "name">;
      incident_packages: TableDef<IncidentPackageRow, "alert_id" | "affected_user_id">;
      notification_events: TableDef<NotificationEventRow, "jam_id" | "channel" | "status">;
      chat_messages: TableDef<ChatMessageRow, "jam_id" | "user_id" | "body">;
    };
    Views: {
      member_profiles: { Row: MemberProfileRow; Relationships: [] };
    };
    Functions: {
      join_jam: { Args: { code: string }; Returns: string };
      /** Returns the deleted recording's storage path (or null) so the caller can remove the file. */
      delete_incident_package: { Args: { p_id: string }; Returns: string | null };
      is_jam_member: { Args: { p_jam_id: string }; Returns: boolean };
      is_active_jam_member: { Args: { p_jam_id: string }; Returns: boolean };
      /** Migration 006: other active members' numbers, only for a caller with an open alert in the Jam. */
      member_phone_numbers: {
        Args: { p_jam_id: string };
        Returns: { user_id: string; display_name: string; phone_number: string }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

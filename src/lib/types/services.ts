import type {
  AiCallContext,
  AiCallTurn,
  HealthScenario,
  HealthSignal,
  IncidentPackage,
  IncidentRecipient,
  LatLng,
  LocationUpdate,
  NotificationResult,
  RiskEvaluation,
  RiskInput,
  Route,
  SmsPreview,
  TravelMode,
} from "./domain";
import type { RealtimeEventMap, RealtimeEventName, RealtimeHandler } from "./events";

/**
 * Service interfaces (contracts). Each lives behind src/services/<name>/index.ts,
 * which exports a mock today. Owners swap in a real implementation in their own folder.
 */

export type Unsubscribe = () => void;

// ---------- location (P3) ----------

export type LocationErrorCode = "permission_denied" | "unavailable" | "timeout" | "unsupported";
export type LocationError = { code: LocationErrorCode; message: string };

export type LocationWatchOptions = {
  jamId: string;
  userId: string;
  onUpdate: (update: LocationUpdate) => void;
  onError?: (error: LocationError) => void;
};

export interface LocationService {
  /** Start watching. Only call after the member granted location consent. */
  watch(options: LocationWatchOptions): Unsubscribe;
  /** Demo override: positions for this user come from a script instead of GPS. `null` = real GPS. */
  setSimulatedPath(userId: string, path: LatLng[] | null): void;
  /** Demo override: jump a simulated user to a point. */
  setSimulatedPosition(userId: string, position: LatLng): void;
}

// ---------- health (P4) ----------

export type HealthStreamOptions = {
  jamId: string;
  userId: string;
  baselineHeartRate: number;
  onSignal: (signal: HealthSignal) => void;
};

export interface HealthService {
  /** Simulated baseline measurement (P2's baseline screen). Resolves with BPM. */
  measureBaseline(options?: { durationMs?: number; onProgress?: (fraction: number) => void }): Promise<number>;
  stream(options: HealthStreamOptions): Unsubscribe;
  setScenario(userId: string, scenario: HealthScenario): void;
}

// ---------- risk (P4) ----------

export interface RiskService {
  /** Pure and deterministic. */
  evaluate(input: RiskInput): RiskEvaluation;
}

// ---------- notifications (P5 implements, P4 calls) ----------

export interface NotificationService {
  notifyGroup(input: { jamId: string; alertId: string }): Promise<NotificationResult[]>;
  /**
   * Last escalation step (after 45s of silence on the AI call). Server-side: creates the incident
   * package (last-seen location, health summary, recording), phones each trusted contact, texts them
   * the location and summary, and pings the group (ntfy). Respects contact_notify_consent and each
   * contact's receive_* toggles. Idempotent per alert. advance-alert runs the same step at
   * CONTACTS_NOTIFIED, so it still happens if every app is closed.
   * recordingPath: the AI-call recording already uploaded to the recordings bucket ({userId}/...).
   */
  notifyContacts(input: { alertId: string; recordingPath?: string }): Promise<NotificationResult[]>;
  previewSms(input: { alertId: string; contactIds: string[] }): Promise<SmsPreview[]>;
  getStatus(jamId: string): Promise<{
    ntfyConfigured: boolean;
    lastNotification: (NotificationResult & { createdAt: string }) | null;
  }>;
}

// ---------- AI (P4) ----------

export interface AiService {
  /** Never throws: falls back to the scripted line if Gemini is down or slow. */
  getSupportCallTurn(context: AiCallContext, step: number): Promise<AiCallTurn>;
}

// ---------- routing (P3) ----------

export interface RoutingService {
  getRoute(origin: LatLng, destination: LatLng, mode: TravelMode): Promise<Route>;
  getAlternativeRoute(origin: LatLng, destination: LatLng, mode: TravelMode): Promise<Route>;
  calculateDistanceFromRoute(location: LatLng, route: Route): number;
}

// ---------- incidents (P4 creates, P5 displays) ----------

export type CreateIncidentInput = Omit<IncidentPackage, "id" | "createdAt" | "deletedAt" | "expiresAt"> & {
  recipients: IncidentRecipient[];
};

export interface IncidentService {
  /** Returns the package plus the raw access token (only its hash is stored). */
  createPackage(input: CreateIncidentInput): Promise<{ incident: IncidentPackage; accessToken: string }>;
  getPackage(id: string): Promise<IncidentPackage | null>;
  deletePackage(id: string): Promise<void>;
}

// ---------- realtime (foundation) ----------

export interface JamChannel {
  readonly jamId: string;
  send<E extends RealtimeEventName>(event: E, payload: RealtimeEventMap[E]): Promise<void>;
  on<E extends RealtimeEventName>(event: E, handler: RealtimeHandler<E>): Unsubscribe;
  /** Release this handle. The underlying connection closes when the last handle releases. */
  release(): void;
}

export interface RealtimeService {
  readonly transport: "supabase" | "mock";
  join(jamId: string): JamChannel;
}

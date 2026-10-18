import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { campusWalk } from "@/lib/demo/campusWalk";
import { mockServicesEnabled } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { JamChannel, JamStatus, LatLng, LocationUpdate, Route, RouteStatus } from "@/lib/types";
import { locationService } from "@/services";
import { useJamEvent } from "@/hooks/useJamChannel";
import { computeRouteStatus } from "./routeStatus";
import { createLocationThrottle } from "./throttle";

/**
 * Shares THIS phone's location with the Jam, only while all of these hold:
 *   location consent · Jam active · member active · not paused · app in the foreground · OS permission.
 * Broadcasts `location_update` every ~4s (plus `member_status` with the route status), and upserts
 * `live_locations` at most every 10s or after a 10m move. Never runs before consent or after the Jam ends.
 */

export type SharingState =
  | "no_consent"
  | "jam_not_active"
  | "left"
  | "checking"
  | "needs_permission"
  | "denied"
  | "services_off"
  | "waiting_for_fix"
  | "live"
  | "paused"
  | "background"
  | "error";

export type LocationSharing = {
  state: SharingState;
  lastSentAt: number | null;
  lastAccuracy: number | null;
  lastPosition: LatLng | null;
  routeStatus: RouteStatus | null;
  simulated: boolean;
  errorMessage: string | null;
  requestPermission: () => Promise<void>;
  openSettings: () => void;
  pause: () => void;
  resume: () => void;
  /** Demo convenience: stand at your Campus Walk start point instead of real GPS (and back). */
  setCampusWalkPosition: (on: boolean) => void;
};

type Options = {
  channel: JamChannel | null;
  jamId: string;
  userId: string | null;
  locationConsent: boolean;
  jamStatus: JamStatus | null;
  isActive: boolean;
  route: Route | null;
};

/** Send a member_status heartbeat at least this often, and whenever the route level changes. */
const STATUS_HEARTBEAT_MS = 20_000;

function campusWalkSpot(userId: string): LatLng {
  const known = campusWalk.members.find((m) => m.userId === userId)?.position;
  if (known) return known;
  // Spread unknown members a few metres apart around the start.
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
  return {
    latitude: campusWalk.start.latitude + 0.0002 * Math.sin(angle),
    longitude: campusWalk.start.longitude + 0.0003 * Math.cos(angle),
  };
}

export function useLocationSharing({ channel, jamId, userId, locationConsent, jamStatus, isActive, route }: Options): LocationSharing {
  const [permission, setPermission] = useState<"checking" | "granted" | "undetermined" | "denied">("checking");
  const [paused, setPaused] = useState(false);
  /** Demo: a presenter told this phone to go quiet ("Stop location updates"). */
  const [suspended, setSuspended] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [watchError, setWatchError] = useState<{ code: string; message: string } | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [lastPosition, setLastPosition] = useState<LatLng | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus | null>(null);
  const [simulated, setSimulated] = useState(false);

  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  /** Timestamps of updates this phone sent, to tell our own echoes from demo-driven moves. */
  const sentTimestamps = useRef(new Set<string>());
  const sentStatusTimestamps = useRef(new Set<string>());
  const lastStatus = useRef<{ level: RouteStatus["level"] | null; at: number }>({ level: null, at: 0 });

  // ---- OS permission (checked, never requested without the explanation screen) ----
  const refreshPermission = useCallback(
    () =>
      Location.getForegroundPermissionsAsync().then(
        (result) => setPermission(result.granted ? "granted" : result.canAskAgain ? "undetermined" : "denied"),
        () => setPermission("denied"),
      ),
    [],
  );

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  const requestPermission = useCallback(async () => {
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      setPermission(result.granted ? "granted" : "denied");
    } catch {
      setPermission("denied");
    }
  }, []);

  // ---- foreground only ----
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      setForeground(next === "active");
      // Permission may have been changed in system Settings while we were away.
      if (next === "active") void refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  const allowed = Boolean(userId) && locationConsent && jamStatus === "active" && isActive;
  const shouldWatch = allowed && !paused && !suspended && foreground && permission === "granted";

  // ---- send helpers ----
  const sendStatus = useCallback(
    (status: { routeStatus?: RouteStatus; sharingEnabled: boolean }) => {
      if (!channel || !userId) return;
      const timestamp = new Date().toISOString();
      sentStatusTimestamps.current.add(timestamp);
      void channel
        .send("member_status", { jamId, userId, presence: status.sharingEnabled ? "live" : "paused", ...status, timestamp })
        .catch((error) => console.warn("[location] member_status send failed", error));
    },
    [channel, jamId, userId],
  );

  const upsert = useCallback(
    async (update: LocationUpdate | null, sharingEnabled: boolean) => {
      const supabase = mockServicesEnabled ? null : getSupabaseClient();
      if (!supabase || !userId) return;
      const row = update
        ? {
            jam_id: jamId,
            user_id: userId,
            latitude: update.latitude,
            longitude: update.longitude,
            accuracy: update.accuracy ?? null,
            activity: update.activity ?? null,
            sharing_enabled: sharingEnabled,
            last_seen_at: update.timestamp,
          }
        : null;
      const { error } = row
        ? await supabase.from("live_locations").upsert(row, { onConflict: "jam_id,user_id" })
        : await supabase.from("live_locations").update({ sharing_enabled: sharingEnabled }).eq("jam_id", jamId).eq("user_id", userId);
      // RLS rejects writes without consent or after the Jam ends; that's expected, not a crash.
      if (error) console.warn("[location] live_locations write skipped:", error.message);
    },
    [jamId, userId],
  );

  // ---- the watch ----
  useEffect(() => {
    if (!shouldWatch || !userId || !channel) return;
    const throttle = createLocationThrottle();

    const stop = locationService.watch({
      jamId,
      userId,
      onUpdate(update) {
        const now = Date.now();
        setWatchError(null);
        const point = { latitude: update.latitude, longitude: update.longitude };
        setLastPosition(point);
        setLastAccuracy(update.accuracy ?? null);

        if (throttle.shouldBroadcast(now)) {
          sentTimestamps.current.add(update.timestamp);
          if (sentTimestamps.current.size > 50) {
            sentTimestamps.current = new Set([...sentTimestamps.current].slice(-25));
          }
          void channel.send("location_update", update).catch((error) => console.warn("[location] send failed", error));
          setLastSentAt(now);

          const current = routeRef.current;
          const status = current ? computeRouteStatus(userId, point, current) : null;
          setRouteStatus(status);
          const levelChanged = status?.level !== lastStatus.current.level;
          if (levelChanged || now - lastStatus.current.at >= STATUS_HEARTBEAT_MS) {
            lastStatus.current = { level: status?.level ?? null, at: now };
            sendStatus({ routeStatus: status ?? undefined, sharingEnabled: true });
          }
        }
        if (throttle.shouldUpsert(point, now)) void upsert(update, true);
      },
      onError(error) {
        setWatchError(error);
        if (error.code === "permission_denied") setPermission("denied");
      },
    });
    return () => {
      stop();
      setWatchError(null);
    };
  }, [shouldWatch, userId, channel, jamId, sendStatus, upsert]);

  // ---- demo: a location for ME that I didn't send means a presenter moved me ----
  useJamEvent(channel, "location_update", (update) => {
    if (!userId || update.userId !== userId || sentTimestamps.current.has(update.timestamp)) return;
    locationService.setSimulatedPosition(userId, { latitude: update.latitude, longitude: update.longitude });
    setSimulated(true);
    setSuspended(false);
  });

  // "Reset demo" or the end of the demo story: back to real GPS (a demo position must never stick).
  const backToGps = useCallback(() => {
    if (!userId) return;
    locationService.setSimulatedPath(userId, null);
    setSimulated(false);
    setSuspended(false);
  }, [userId]);
  useJamEvent(channel, "demo_reset", (e) => {
    if (e.jamId === jamId) backToGps();
  });
  useJamEvent(channel, "demo_story", (e) => {
    if (e.jamId === jamId && !e.running) backToGps();
  });

  useJamEvent(channel, "member_status", (event) => {
    if (!userId || event.userId !== userId || sentStatusTimestamps.current.has(event.timestamp)) return;
    // Presence hints from the map demo actions: "offline" = stop updates, "live" = resume.
    if (event.presence === "offline") setSuspended(true);
    if (event.presence === "live") setSuspended(false);
  });

  // Stopping for good (Jam ended / left / consent withdrawn) clears the demo override.
  const [wasAllowed, setWasAllowed] = useState(allowed);
  if (wasAllowed !== allowed) {
    setWasAllowed(allowed);
    if (!allowed) {
      setSimulated(false);
      setSuspended(false);
    }
  }
  useEffect(() => {
    if (!allowed && userId) locationService.setSimulatedPath(userId, null);
  }, [allowed, userId]);

  const pause = useCallback(() => {
    setPaused(true);
    sendStatus({ sharingEnabled: false });
    void upsert(null, false);
  }, [sendStatus, upsert]);

  const resume = useCallback(() => {
    setPaused(false);
    lastStatus.current = { level: null, at: 0 };
    sendStatus({ sharingEnabled: true });
  }, [sendStatus]);

  const setCampusWalkPosition = useCallback(
    (on: boolean) => {
      if (!userId) return;
      if (on) locationService.setSimulatedPosition(userId, campusWalkSpot(userId));
      else locationService.setSimulatedPath(userId, null);
      setSimulated(on);
    },
    [userId],
  );

  const openSettings = useCallback(() => {
    void Linking.openSettings().catch(() => undefined);
  }, []);

  let state: SharingState;
  if (!locationConsent) state = "no_consent";
  else if (!isActive) state = "left";
  else if (jamStatus !== "active") state = "jam_not_active";
  else if (paused) state = "paused";
  else if (!foreground) state = "background";
  else if (permission === "checking") state = "checking";
  else if (permission === "undetermined") state = "needs_permission";
  else if (permission === "denied") state = "denied";
  else if (watchError?.code === "unavailable" && !simulated) state = "services_off";
  else if (watchError && watchError.code !== "timeout" && !simulated) state = "error";
  else if (lastSentAt === null || suspended) state = "waiting_for_fix";
  else state = "live";

  return {
    state,
    lastSentAt,
    lastAccuracy,
    lastPosition,
    routeStatus,
    simulated,
    errorMessage: watchError?.message ?? null,
    requestPermission,
    openSettings,
    pause,
    resume,
    setCampusWalkPosition,
  };
}

import * as Location from "expo-location";
import type { LatLng, LocationError, LocationService, LocationWatchOptions, Unsubscribe } from "@/lib/types";
import { mockLocationService } from "./mock";

/**
 * Real foreground GPS via expo-location, with the mock as the per-user SIMULATED source.
 *
 * - `watch()` does not prompt for permission. Show the explanation screen first and call
 *   `Location.requestForegroundPermissionsAsync()` from there (see useLocationSharing).
 * - `setSimulatedPath` / `setSimulatedPosition` switch that user's running watch to the
 *   Campus Walk script (Demo Mode); `setSimulatedPath(userId, null)` switches back to GPS.
 * - Foreground-only: callers stop the watch when the app backgrounds.
 */

const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 4_000,
  distanceInterval: 5,
};
/** Report a timeout (non-fatal) if no first fix arrives in this long. */
const FIRST_FIX_TIMEOUT_MS = 20_000;
/** Fixes worse than this are still shown, but flagged as low accuracy in the UI. */
export const POOR_ACCURACY_M = 100;

const simulated = new Set<string>();
const restarters = new Map<string, Set<() => void>>();

function restart(userId: string) {
  restarters.get(userId)?.forEach((fn) => fn());
}

function activityFromSpeed(speed: number | null | undefined): string | undefined {
  if (speed == null || speed < 0) return undefined;
  if (speed > 2.5) return "running";
  if (speed > 0.5) return "walking";
  return "stationary";
}

function startGps({ jamId, userId, onUpdate, onError }: LocationWatchOptions): Unsubscribe {
  let cancelled = false;
  let subscription: Location.LocationSubscription | null = null;
  let gotFix = false;
  const report = (error: LocationError) => {
    if (!cancelled) onError?.(error);
  };
  const timer = setTimeout(() => {
    if (!gotFix) report({ code: "timeout", message: "Still waiting for a GPS fix." });
  }, FIRST_FIX_TIMEOUT_MS);

  void (async () => {
    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        report({ code: "unavailable", message: "Location services are turned off on this phone." });
        return;
      }
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        report({ code: "permission_denied", message: "Location permission hasn't been granted." });
        return;
      }
      const sub = await Location.watchPositionAsync(
        WATCH_OPTIONS,
        (location) => {
          if (cancelled) return;
          gotFix = true;
          const { latitude, longitude, accuracy, speed } = location.coords;
          onUpdate({
            jamId,
            userId,
            latitude,
            longitude,
            accuracy: accuracy != null && accuracy >= 0 ? accuracy : undefined,
            activity: activityFromSpeed(speed),
            timestamp: new Date(location.timestamp || Date.now()).toISOString(),
          });
        },
        (reason) => report({ code: "unavailable", message: reason || "Location is unavailable." }),
      );
      if (cancelled) sub.remove();
      else subscription = sub;
    } catch (error) {
      report({ code: "unavailable", message: error instanceof Error ? error.message : "Location is unavailable." });
    }
  })();

  return () => {
    cancelled = true;
    clearTimeout(timer);
    subscription?.remove();
    subscription = null;
  };
}

export const deviceLocationService: LocationService = {
  watch(options) {
    let stop: Unsubscribe | null = null;
    const start = () => {
      stop?.();
      stop = simulated.has(options.userId) ? mockLocationService.watch(options) : startGps(options);
    };
    const set = restarters.get(options.userId) ?? new Set();
    restarters.set(options.userId, set);
    set.add(start);
    start();
    return () => {
      set.delete(start);
      stop?.();
      stop = null;
    };
  },
  setSimulatedPath(userId, path: LatLng[] | null) {
    mockLocationService.setSimulatedPath(userId, path);
    if (path) simulated.add(userId);
    else simulated.delete(userId);
    restart(userId);
  },
  setSimulatedPosition(userId, position) {
    mockLocationService.setSimulatedPosition(userId, position);
    const wasSimulated = simulated.has(userId);
    simulated.add(userId);
    // Already simulated: the running mock watch picks up the new position on its next tick.
    if (!wasSimulated) restart(userId);
  },
};

/** True while this user's positions come from the simulated (demo) source. */
export const isLocationSimulated = (userId: string) => simulated.has(userId);

import { LOCATION_BROADCAST_INTERVAL_MS } from "@/lib/constants";
import { campusWalk } from "@/lib/demo/campusWalk";
import type { LatLng, LocationService } from "@/lib/types";

/**
 * Simulated location source. Positions come from campus-walk.json and demo overrides, never GPS.
 * The real GPS source is ./device.ts, which delegates here for simulated (Demo Mode) users.
 */
const paths = new Map<string, { path: LatLng[]; index: number }>();
const positions = new Map<string, LatLng>();

function startingPosition(userId: string): LatLng {
  return campusWalk.members.find((m) => m.userId === userId)?.position ?? campusWalk.start;
}

function nextPosition(userId: string): LatLng {
  const scripted = paths.get(userId);
  if (scripted && scripted.path.length > 0) {
    const point = scripted.path[Math.min(scripted.index, scripted.path.length - 1)]!;
    scripted.index++;
    positions.set(userId, point);
    return point;
  }
  return positions.get(userId) ?? startingPosition(userId);
}

export const mockLocationService: LocationService = {
  watch({ jamId, userId, onUpdate }) {
    const emit = () => {
      const { latitude, longitude } = nextPosition(userId);
      onUpdate({
        jamId,
        userId,
        latitude,
        longitude,
        accuracy: 8,
        activity: "walking",
        timestamp: new Date().toISOString(),
      });
    };
    emit();
    const timer = setInterval(emit, LOCATION_BROADCAST_INTERVAL_MS);
    return () => clearInterval(timer);
  },
  setSimulatedPath(userId, path) {
    if (path) paths.set(userId, { path, index: 0 });
    else paths.delete(userId);
  },
  setSimulatedPosition(userId, position) {
    paths.delete(userId);
    positions.set(userId, position);
  },
};

import {
  LOCATION_BROADCAST_INTERVAL_MS,
  LOCATION_DB_UPSERT_INTERVAL_MS,
  LOCATION_SIGNIFICANT_CHANGE_M,
} from "@/lib/constants";
import { haversineM } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

/**
 * Decides when a new position is broadcast (every ~4s) and when it's written to
 * live_locations (at most every 10s, or sooner after a move of 10m or more).
 */
export function createLocationThrottle(
  options: { broadcastMs?: number; upsertMs?: number; significantM?: number } = {},
) {
  const broadcastMs = options.broadcastMs ?? LOCATION_BROADCAST_INTERVAL_MS;
  const upsertMs = options.upsertMs ?? LOCATION_DB_UPSERT_INTERVAL_MS;
  const significantM = options.significantM ?? LOCATION_SIGNIFICANT_CHANGE_M;

  let lastBroadcastAt: number | null = null;
  let lastUpsertAt: number | null = null;
  let lastUpsertPoint: LatLng | null = null;

  return {
    shouldBroadcast(now: number): boolean {
      // Small slack so a 4s GPS cadence doesn't skip every other fix.
      if (lastBroadcastAt !== null && now - lastBroadcastAt < broadcastMs - 250) return false;
      lastBroadcastAt = now;
      return true;
    },
    shouldUpsert(point: LatLng, now: number): boolean {
      const due = lastUpsertAt === null || now - lastUpsertAt >= upsertMs;
      const moved = lastUpsertPoint !== null && haversineM(lastUpsertPoint, point) >= significantM;
      if (!due && !moved) return false;
      lastUpsertAt = now;
      lastUpsertPoint = point;
      return true;
    },
    reset() {
      lastBroadcastAt = null;
      lastUpsertAt = null;
      lastUpsertPoint = null;
    },
  };
}

export type LocationThrottle = ReturnType<typeof createLocationThrottle>;

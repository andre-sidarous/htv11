import type { LiveLocationRow, LocationUpdate, MemberStatusEvent } from "@/lib/types";

/**
 * Pure merge rules for the Group tab's per-member "last seen" state. Two sources feed it:
 *
 * - `live_locations` rows (initial load + a periodic re-read). This table is NOT in the
 *   `supabase_realtime` publication, so postgres_changes never fires for it.
 * - Realtime broadcasts on `jam:{jamId}`: `location_update` every ~4s while a member shares,
 *   and `member_status` when they pause/resume.
 *
 * A broadcast counts as seen when it ARRIVES (phone clocks differ); DB rows keep their stored
 * `last_seen_at`. The newer of the two always wins, so a slower DB re-read never makes a live
 * member look stale.
 */

export type LiveLocationView = Pick<LiveLocationRow, "user_id" | "last_seen_at" | "sharing_enabled" | "activity">;

const time = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/** Apply a fresh DB read. Keeps local entries that are newer than the DB (or missing from it). */
export function mergeDbRows(
  current: ReadonlyMap<string, LiveLocationView>,
  rows: readonly LiveLocationView[],
): Map<string, LiveLocationView> {
  const next = new Map(current);
  for (const row of rows) {
    const local = next.get(row.user_id);
    if (!local || time(row.last_seen_at) >= time(local.last_seen_at)) {
      next.set(row.user_id, {
        user_id: row.user_id,
        last_seen_at: row.last_seen_at,
        sharing_enabled: row.sharing_enabled,
        activity: row.activity,
      });
    }
  }
  return next;
}

export function applyLocationUpdate(
  current: ReadonlyMap<string, LiveLocationView>,
  update: LocationUpdate,
  receivedAt: number,
): Map<string, LiveLocationView> {
  const next = new Map(current);
  const previous = current.get(update.userId);
  next.set(update.userId, {
    user_id: update.userId,
    last_seen_at: new Date(receivedAt).toISOString(),
    sharing_enabled: true,
    activity: update.activity ?? previous?.activity ?? null,
  });
  return next;
}

/** Only `sharingEnabled` matters here; broadcast `presence` hints are ignored (timers decide). */
export function applyMemberStatus(
  current: ReadonlyMap<string, LiveLocationView>,
  event: MemberStatusEvent,
): ReadonlyMap<string, LiveLocationView> {
  if (event.sharingEnabled === undefined) return current;
  const previous = current.get(event.userId);
  if (previous?.sharing_enabled === event.sharingEnabled) return current;
  const next = new Map(current);
  next.set(event.userId, {
    user_id: event.userId,
    last_seen_at: previous?.last_seen_at ?? "",
    sharing_enabled: event.sharingEnabled,
    activity: previous?.activity ?? null,
  });
  return next;
}

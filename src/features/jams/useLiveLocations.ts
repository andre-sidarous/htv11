import { useCallback, useEffect, useState } from "react";
import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { applyLocationUpdate, applyMemberStatus, mergeDbRows, type LiveLocationView } from "./liveLocationMerge";
import { withTimeout } from "./withTimeout";

/** Re-read `live_locations` this often as a backstop for missed broadcasts. */
const DB_REFRESH_MS = 15_000;

/**
 * Latest location status per member, for display only (last-seen / activity / sharing status in
 * the Group tab). RLS already restricts the table to active members who've consented.
 *
 * `live_locations` isn't in the realtime publication, so this listens to the same
 * `location_update` / `member_status` broadcasts the map uses, and re-reads the table
 * periodically. See liveLocationMerge.ts for how the two are combined.
 */
export function useLiveLocations(jamId: string | undefined) {
  const [byUserId, setByUserId] = useState<ReadonlyMap<string, LiveLocationView>>(new Map());
  const [loading, setLoading] = useState(true);
  const channel = useJamChannel(jamId);

  const refresh = useCallback(async () => {
    if (!jamId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await withTimeout(supabase.from("live_locations").select("*").eq("jam_id", jamId));
      setByUserId((current) => mergeDbRows(current, data ?? []));
    } catch {
      // Display-only data: fail quietly; broadcasts and the next re-read will catch up.
    } finally {
      setLoading(false);
    }
  }, [jamId]);

  // Fetching when `jamId` changes is the standard Effect use case; `refresh` also re-runs on
  // the interval below, so it has to stay callable, not inlined here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setByUserId(new Map());
    void refresh();
    const timer = setInterval(() => void refresh(), DB_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useJamEvent(channel, "location_update", (update) => {
    if (update.jamId === jamId) setByUserId((current) => applyLocationUpdate(current, update, Date.now()));
  });
  useJamEvent(channel, "member_status", (event) => {
    if (event.jamId === jamId) setByUserId((current) => applyMemberStatus(current, event));
  });

  return { byUserId, loading };
}

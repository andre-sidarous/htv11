import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { LiveLocationRow } from "@/lib/types";
import { useTableChanges } from "./realtimeTable";

/**
 * Latest `live_locations` row per member, for display only (last-seen / activity / sharing
 * status in the Group tab). RLS already restricts this to active members who've consented.
 */
export function useLiveLocations(jamId: string | undefined) {
  const [byUserId, setByUserId] = useState<Map<string, LiveLocationRow>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!jamId) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("live_locations").select("*").eq("jam_id", jamId);
    setByUserId(new Map((data ?? []).map((row) => [row.user_id, row])));
    setLoading(false);
  }, [jamId]);

  // Fetching when `jamId` changes is the standard Effect use case; `refresh` also re-runs on
  // realtime updates via useTableChanges below, so it has to stay callable, not inlined here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refresh();
  }, [refresh]);

  useTableChanges("live_locations", jamId ? `jam_id=eq.${jamId}` : null, refresh);

  return { byUserId, loading };
}

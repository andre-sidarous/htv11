import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useTableChanges } from "./realtimeTable";
import { withTimeout } from "./withTimeout";

/** True while the given user has an open (unresolved) alert in this Jam. Settings uses this
 * to block changing the emergency preference mid-escalation, per docs/architecture.md. */
export function useHasActiveAlert(jamId: string | undefined, userId: string | undefined) {
  const [hasActiveAlert, setHasActiveAlert] = useState(false);

  const refresh = useCallback(async () => {
    if (!jamId || !userId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      const { data } = await withTimeout(
        supabase
          .from("alerts")
          .select("id")
          .eq("jam_id", jamId)
          .eq("affected_user_id", userId)
          .is("resolved_at", null)
          .limit(1),
      );
      setHasActiveAlert(Boolean(data && data.length > 0));
    } catch {
      // Non-critical: Settings just won't lock the preference picker until the next retry.
    }
  }, [jamId, userId]);

  // Fetching when `jamId`/`userId` change is the standard Effect use case; `refresh` also
  // re-runs on realtime updates via useTableChanges below.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useTableChanges("alerts", jamId ? `jam_id=eq.${jamId}` : null, refresh);

  return { hasActiveAlert, refresh };
}

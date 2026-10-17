import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { JamRow } from "@/lib/types";
import { useTableChanges } from "./realtimeTable";
import { withTimeout } from "./withTimeout";

/** The Jam row, kept live via `postgres_changes` (jams is in the realtime publication). */
export function useJam(jamId: string | undefined) {
  const [jam, setJam] = useState<JamRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!jamId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await withTimeout(supabase.from("jams").select("*").eq("id", jamId).maybeSingle());
      if (error) setError(error.message);
      else {
        setJam(data ?? null);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this Jam.");
    } finally {
      setLoading(false);
    }
  }, [jamId]);

  // Fetching when `jamId` changes is the standard Effect use case; `refresh` also re-runs on
  // realtime updates via useTableChanges below, so it has to stay callable, not inlined here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refresh();
  }, [refresh]);

  useTableChanges("jams", jamId ? `id=eq.${jamId}` : null, refresh);

  return { jam, loading, error, refresh };
}

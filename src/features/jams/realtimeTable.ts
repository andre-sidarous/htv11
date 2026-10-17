import { useEffect, useId, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Subscribes to `postgres_changes` for one table + filter and calls `onChange` on every
 * insert/update/delete. Used for the lobby and group list, where re-fetching on change is
 * simpler and safer than patching rows by hand. A no-op when Supabase isn't configured
 * (the mock realtime transport doesn't cover `postgres_changes`).
 *
 * The channel name includes a per-hook-instance id: `supabase.channel(topic)` returns the SAME
 * channel object for a repeated topic string, and calling `.on()` on an already-subscribed
 * channel throws. Two screens watching the same table+filter at once (e.g. Group and Settings,
 * both mounted together under the bottom tabs) would otherwise collide on one shared channel.
 */
export function useTableChanges(table: string, filter: string | null, onChange: () => void) {
  const instanceId = useId();
  const handlerRef = useRef(onChange);
  useEffect(() => {
    handlerRef.current = onChange;
  });

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !filter) return;

    const channel = supabase
      .channel(`changes:${table}:${filter}:${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => handlerRef.current())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, instanceId]);
}

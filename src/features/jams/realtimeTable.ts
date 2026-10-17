import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Subscribes to `postgres_changes` for one table + filter and calls `onChange` on every
 * insert/update/delete. Used for the lobby and group list, where re-fetching on change is
 * simpler and safer than patching rows by hand. A no-op when Supabase isn't configured
 * (the mock realtime transport doesn't cover `postgres_changes`).
 */
export function useTableChanges(table: string, filter: string | null, onChange: () => void) {
  const handlerRef = useRef(onChange);
  useEffect(() => {
    handlerRef.current = onChange;
  });

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !filter) return;

    const channel = supabase
      .channel(`changes:${table}:${filter}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => handlerRef.current())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter]);
}

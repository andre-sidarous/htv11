import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { JamMemberRow, JamRow } from "@/lib/types";
import { withTimeout } from "./withTimeout";

export type MyJam = { membership: JamMemberRow; jam: JamRow };

/** The signed-in user's Jams, split into active and past, for the Home screen. */
export function useMyJams(userId: string | undefined) {
  const [active, setActive] = useState<MyJam[]>([]);
  const [past, setPast] = useState<MyJam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
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
      const { data: memberships, error: memberError } = await withTimeout(
        supabase.from("jam_members").select("*").eq("user_id", userId),
      );
      if (memberError) throw new Error(memberError.message);

      const jamIds = (memberships ?? []).map((m) => m.jam_id);
      const { data: jams } = jamIds.length
        ? await withTimeout(supabase.from("jams").select("*").in("id", jamIds))
        : { data: [] as JamRow[] };
      const jamById = new Map((jams ?? []).map((j) => [j.id, j]));

      const pairs = (memberships ?? [])
        .map((membership) => ({ membership, jam: jamById.get(membership.jam_id) }))
        .filter((pair): pair is MyJam => Boolean(pair.jam));

      setActive(pairs.filter((pair) => pair.membership.is_active && pair.jam.status !== "ended"));
      setPast(pairs.filter((pair) => !pair.membership.is_active || pair.jam.status === "ended"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your Huddles.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Fetching when `userId` changes is the standard Effect use case.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refresh();
  }, [refresh]);

  return { active, past, loading, error, refresh };
}

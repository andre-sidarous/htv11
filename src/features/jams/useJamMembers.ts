import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { JamMemberRow, MemberProfileRow } from "@/lib/types";
import { useTableChanges } from "./realtimeTable";
import { withTimeout } from "./withTimeout";

export type JamMemberWithProfile = JamMemberRow & { profile: MemberProfileRow | null };

/**
 * Joined members (+ names from `member_profiles`, since `profiles` is own-row-only), kept
 * live via `postgres_changes` on `jam_members`. Used by the lobby and the Group tab.
 */
export function useJamMembers(jamId: string | undefined) {
  const [members, setMembers] = useState<JamMemberWithProfile[]>([]);
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
      const { data: memberRows, error: memberError } = await withTimeout(
        supabase.from("jam_members").select("*").eq("jam_id", jamId).order("joined_at", { ascending: true }),
      );
      if (memberError) throw new Error(memberError.message);

      const ids = (memberRows ?? []).map((m) => m.user_id);
      const { data: profileRows } = ids.length
        ? await withTimeout(supabase.from("member_profiles").select("*").in("id", ids))
        : { data: [] as MemberProfileRow[] };
      const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

      setMembers((memberRows ?? []).map((m) => ({ ...m, profile: profileById.get(m.user_id) ?? null })));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the group.");
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

  useTableChanges("jam_members", jamId ? `jam_id=eq.${jamId}` : null, refresh);

  return { members, loading, error, refresh };
}

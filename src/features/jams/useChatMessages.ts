import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatMessageRow } from "@/lib/types";
import { withTimeout } from "./withTimeout";

const HISTORY_LIMIT = 200;

/**
 * Chat history + live updates for one Jam. New messages are appended from the
 * `postgres_changes` INSERT payload directly rather than refetching the whole history on every
 * message, so the list stays stable while scrolled and doesn't grow slower as the chat does.
 */
export function useChatMessages(jamId: string | undefined) {
  const instanceId = useId();
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef(new Set<string>());

  const load = useCallback(async () => {
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
      const { data, error } = await withTimeout(
        supabase.from("chat_messages").select("*").eq("jam_id", jamId).order("created_at", { ascending: true }).limit(HISTORY_LIMIT),
      );
      if (error) throw new Error(error.message);
      seenIds.current = new Set((data ?? []).map((m) => m.id));
      setMessages(data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load chat.");
    } finally {
      setLoading(false);
    }
  }, [jamId]);

  // Fetching when `jamId` changes is the standard Effect use case.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !jamId) return;

    const channel = supabase
      .channel(`chat:jam_id=eq.${jamId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `jam_id=eq.${jamId}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setMessages((prev) => [...prev, row]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jamId, instanceId]);

  async function send(body: string): Promise<string | null> {
    const trimmed = body.trim();
    if (!trimmed || !jamId) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return "Supabase is not configured.";
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return "Sign in and try again.";
    const { error } = await supabase.from("chat_messages").insert({ jam_id: jamId, user_id: userId, body: trimmed });
    return error?.message ?? null;
  }

  return { messages, loading, error, send, refresh: load };
}

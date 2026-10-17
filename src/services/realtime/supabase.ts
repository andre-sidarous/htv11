import type { RealtimeChannel } from "@supabase/supabase-js";
import { jamChannelName } from "@/lib/constants";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { RealtimeService } from "@/lib/types";
import { createChannelHub, type TransportFactory } from "./hub";

/** Channel topic → its removal still in flight (leave a Jam, then rejoin it in the same session). */
const closing = new Map<string, Promise<unknown>>();

/**
 * Supabase Broadcast transport. POC limitation: channels are public-but-unguessable
 * (jamId is a UUID). See docs/architecture.md before putting sensitive data in payloads.
 *
 * Every phone must use the same topic (`jam:{jamId}`), and `supabase.channel(topic)` returns the
 * EXISTING channel for a topic until its removal finishes. Leaving and quickly rejoining would hand
 * back the channel being torn down, leaving this phone deaf and mute (no location to or from the
 * group). So a new transport first waits for any earlier one on the same topic to close.
 */
const supabaseTransport: TransportFactory = (jamId, deliver) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured; use the mock realtime service.");
  const name = jamChannelName(jamId);

  const opened: Promise<{ channel: RealtimeChannel; ready: Promise<void> }> = (async () => {
    await closing.get(name)?.catch(() => undefined);
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${name}`);
    if (stale) await supabase.removeChannel(stale).catch(() => undefined);

    const channel = supabase.channel(name, { config: { broadcast: { self: true, ack: false } } });
    channel.on("broadcast", { event: "*" }, (message) => deliver(message.event, message.payload));
    const ready = new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[realtime] ${name}: ${status}, retrying automatically`);
        }
      });
    });
    return { channel, ready };
  })();

  return {
    async send(event, payload) {
      const { channel, ready } = await opened;
      // Don't hang forever if the socket never joins; supabase-js falls back to HTTP for unjoined sends.
      await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 5_000))]);
      const result = await channel.send({ type: "broadcast", event, payload });
      if (result !== "ok") console.warn(`[realtime] send "${event}" returned ${result}`);
    },
    close() {
      const removal = opened.then(({ channel }) => supabase.removeChannel(channel));
      closing.set(name, removal);
      void removal.finally(() => {
        if (closing.get(name) === removal) closing.delete(name);
      });
    },
  };
};

export const supabaseRealtimeService: RealtimeService = {
  transport: "supabase",
  join: createChannelHub(supabaseTransport),
};

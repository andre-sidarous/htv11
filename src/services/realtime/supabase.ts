import { jamChannelName } from "@/lib/constants";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { RealtimeService } from "@/lib/types";
import { createChannelHub, type TransportFactory } from "./hub";

/**
 * Supabase Broadcast transport. POC limitation: channels are public-but-unguessable
 * (jamId is a UUID). See docs/architecture.md before putting sensitive data in payloads.
 */
const supabaseTransport: TransportFactory = (jamId, deliver) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured; use the mock realtime service.");

  const channel = supabase.channel(jamChannelName(jamId), {
    config: { broadcast: { self: true, ack: false } },
  });
  channel.on("broadcast", { event: "*" }, (message) => deliver(message.event, message.payload));

  const ready = new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`[realtime] ${jamChannelName(jamId)}: ${status}, retrying automatically`);
      }
    });
  });

  return {
    async send(event, payload) {
      // Don't hang forever if the socket never joins; supabase-js falls back to HTTP for unjoined sends.
      await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 5_000))]);
      const result = await channel.send({ type: "broadcast", event, payload });
      if (result !== "ok") console.warn(`[realtime] send "${event}" returned ${result}`);
    },
    close() {
      void supabase.removeChannel(channel);
    },
  };
};

export const supabaseRealtimeService: RealtimeService = {
  transport: "supabase",
  join: createChannelHub(supabaseTransport),
};

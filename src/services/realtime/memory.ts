import type { RealtimeService } from "@/lib/types";
import { createChannelHub, type TransportFactory } from "./hub";

/**
 * In-memory transport for running with no Supabase: messages loop back to listeners on
 * THIS device only (self: true parity with Supabase). Cross-phone demos need Supabase.
 */
const loopbackTransport: TransportFactory = (_jamId, deliver) => ({
  async send(event, payload) {
    // Async like a network hop, so handlers never run inside the caller's stack.
    setTimeout(() => deliver(event, payload), 0);
  },
  close() {},
});

export const memoryRealtimeService: RealtimeService = {
  transport: "mock",
  join: createChannelHub(loopbackTransport),
};

import type { JamChannel, RealtimeEventMap, RealtimeEventName, RealtimeHandler, Unsubscribe } from "@/lib/types";
import { parseRealtimeEvent } from "@/lib/validation";

/** A transport moves raw {event, payload} messages for one Jam. */
export interface Transport {
  send(event: RealtimeEventName, payload: unknown): Promise<void>;
  close(): void;
}

export type TransportFactory = (jamId: string, deliver: (event: string, payload: unknown) => void) => Transport;

type Entry = {
  transport: Transport;
  refs: number;
  listeners: Map<RealtimeEventName, Set<(payload: never) => void>>;
};

/**
 * Ref-counted channel registry shared by both transports. Many components can join the
 * same Jam; there's one connection per Jam. Inbound payloads are validated before handlers run.
 * Delivery includes your own messages (self: true), so filter by userId if you need to.
 */
export function createChannelHub(factory: TransportFactory) {
  const entries = new Map<string, Entry>();

  function deliver(jamId: string, event: string, payload: unknown) {
    const entry = entries.get(jamId);
    const handlers = entry?.listeners.get(event as RealtimeEventName);
    if (!handlers?.size) return;
    const parsed = parseRealtimeEvent(event as RealtimeEventName, payload);
    if (!parsed) {
      console.warn(`[realtime] dropped invalid "${event}" payload`, payload);
      return;
    }
    handlers.forEach((handler) => {
      try {
        (handler as (p: typeof parsed) => void)(parsed);
      } catch (error) {
        console.error(`[realtime] "${event}" handler threw`, error);
      }
    });
  }

  return function join(jamId: string): JamChannel {
    let entry = entries.get(jamId);
    if (!entry) {
      entry = {
        transport: factory(jamId, (event, payload) => deliver(jamId, event, payload)),
        refs: 0,
        listeners: new Map(),
      };
      entries.set(jamId, entry);
    }
    entry.refs++;
    const current = entry;
    const owned: Unsubscribe[] = [];
    let released = false;

    return {
      jamId,
      async send<E extends RealtimeEventName>(event: E, payload: RealtimeEventMap[E]) {
        if (released) throw new Error("JamChannel used after release()");
        await current.transport.send(event, payload);
      },
      on<E extends RealtimeEventName>(event: E, handler: RealtimeHandler<E>) {
        const set = current.listeners.get(event) ?? new Set();
        current.listeners.set(event, set);
        set.add(handler as (payload: never) => void);
        const off = () => set.delete(handler as (payload: never) => void);
        owned.push(off);
        return off;
      },
      release() {
        if (released) return;
        released = true;
        owned.forEach((off) => off());
        if (--current.refs === 0) {
          current.transport.close();
          entries.delete(jamId);
        }
      },
    };
  };
}

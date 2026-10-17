import { useEffect, useMemo, useRef } from "react";
import { realtimeService } from "@/services/realtime";
import type { JamChannel, RealtimeEventName, RealtimeHandler, Unsubscribe } from "@/lib/types";

type AnyHandler = (payload: never) => void;
type Registration = { event: RealtimeEventName; handler: AnyHandler; off?: Unsubscribe };

/** Re-attach a stored (type-erased) registration; types were checked when on() was called. */
const attach = (channel: JamChannel, r: Registration) =>
  (channel.on as (event: RealtimeEventName, handler: AnyHandler) => Unsubscribe)(r.event, r.handler);

/**
 * A JamChannel that connects lazily. `on()` works before connect (handlers attach on connect),
 * and release/connect can repeat (React StrictMode mounts effects twice in dev).
 */
function createLazyChannel(jamId: string): JamChannel & { connect(): void } {
  let inner: JamChannel | null = null;
  const registrations = new Set<Registration>();

  return {
    jamId,
    connect() {
      if (inner) return;
      const joined = realtimeService.join(jamId);
      inner = joined;
      registrations.forEach((r) => (r.off = attach(joined, r)));
    },
    release() {
      registrations.forEach((r) => {
        r.off?.();
        r.off = undefined;
      });
      inner?.release();
      inner = null;
    },
    on(event, handler) {
      const registration: Registration = { event, handler: handler as AnyHandler };
      registration.off = inner ? attach(inner, registration) : undefined;
      registrations.add(registration);
      return () => {
        registration.off?.();
        registrations.delete(registration);
      };
    },
    async send(event, payload) {
      if (!inner) throw new Error("Jam channel isn't connected yet.");
      await inner.send(event, payload);
    },
  };
}

/** Joins `jam:{jamId}` for the component's lifetime. Returns null if jamId is null. */
export function useJamChannel(jamId: string | null | undefined): JamChannel | null {
  const channel = useMemo(() => (jamId ? createLazyChannel(jamId) : null), [jamId]);

  useEffect(() => {
    if (!channel) return;
    channel.connect();
    return () => channel.release();
  }, [channel]);

  return channel;
}

/**
 * Subscribe to one event. The handler can change between renders without resubscribing.
 * Example: useJamEvent(channel, "location_update", (u) => moveMarker(u));
 */
export function useJamEvent<E extends RealtimeEventName>(
  channel: JamChannel | null,
  event: E,
  handler: RealtimeHandler<E>,
) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!channel) return;
    return channel.on(event, (payload) => handlerRef.current(payload));
  }, [channel, event]);
}

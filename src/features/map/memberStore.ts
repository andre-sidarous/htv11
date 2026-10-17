import { presenceFor } from "@/features/location/presence";
import { computeRouteStatus } from "@/features/location/routeStatus";
import type {
  HealthSignal,
  LatLng,
  LocationUpdate,
  MemberPresence,
  MemberStatusEvent,
  Route,
  RouteStatus,
  SafetyAlert,
} from "@/lib/types";

/**
 * Live per-member map state, keyed by userId. Each entry is an immutable snapshot that is
 * replaced only when that member changes, so a marker subscribed to one member re-renders
 * only for that member (useSyncExternalStore). Pure TS: unit-testable, no React Native.
 */

export const TRAIL_MAX_POINTS = 200;

export type MemberLive = {
  userId: string;
  position: LatLng | null;
  accuracy?: number;
  /** From location updates, overridden by the latest simulated health activity when present. */
  activity?: string;
  lastSeenAt: number | null;
  sharingEnabled: boolean;
  presence: MemberPresence;
  routeStatus: RouteStatus | null;
  trail: LatLng[];
  /** An unresolved alert exists for this member (display only; P4 owns the scoring). */
  possibleConcern: boolean;
};

type Listener = () => void;

export function createMemberStore() {
  const members = new Map<string, MemberLive>();
  const openAlerts = new Map<string, Set<string>>();
  const listeners = new Map<string, Set<Listener>>();
  const listListeners = new Set<Listener>();
  let ids: string[] = [];
  let route: Route | null = null;

  const blank = (userId: string): MemberLive => ({
    userId,
    position: null,
    lastSeenAt: null,
    sharingEnabled: true,
    presence: "unavailable",
    routeStatus: null,
    trail: [],
    possibleConcern: false,
  });

  function put(userId: string, update: (current: MemberLive) => MemberLive) {
    const current = members.get(userId) ?? blank(userId);
    const next = update(current);
    if (next === current) return;
    const isNew = !members.has(userId);
    members.set(userId, next);
    listeners.get(userId)?.forEach((l) => l());
    if (isNew) {
      ids = [...members.keys()];
      listListeners.forEach((l) => l());
    }
  }

  const statusFor = (userId: string, position: LatLng | null) =>
    route && position ? computeRouteStatus(userId, position, route) : null;

  return {
    get: (userId: string): MemberLive | undefined => members.get(userId),
    /** Stable between membership changes. */
    ids: (): string[] => ids,
    all: (): MemberLive[] => [...members.values()],

    /** Make sure a known member has an entry (so they appear as "Location unavailable"). */
    ensure(userId: string) {
      if (!members.has(userId)) put(userId, (m) => ({ ...m }));
    },

    /**
     * A realtime update counts as "seen" when it arrives (phone clocks differ). For rows loaded
     * from live_locations, pass their `last_seen_at` as `seenAt`.
     */
    applyLocation(u: LocationUpdate, now = Date.now(), seenAt?: number) {
      const lastSeenAt = seenAt !== undefined && Number.isFinite(seenAt) ? Math.min(seenAt, now) : now;
      put(u.userId, (m) => {
        if (m.lastSeenAt !== null && lastSeenAt < m.lastSeenAt) return m; // older than what we have
        const position = { latitude: u.latitude, longitude: u.longitude };
        const trail = [...m.trail, position].slice(-TRAIL_MAX_POINTS);
        return {
          ...m,
          position,
          accuracy: u.accuracy,
          activity: u.activity ?? m.activity,
          lastSeenAt,
          sharingEnabled: true,
          presence: presenceFor({ lastSeenAt, now }),
          routeStatus: statusFor(u.userId, position),
          trail,
        };
      });
    },

    /** Presence is always computed locally from timestamps; only `sharingEnabled` is taken from the event. */
    applyStatus(e: MemberStatusEvent, now = Date.now()) {
      if (e.sharingEnabled === undefined) return;
      const sharingEnabled = e.sharingEnabled;
      put(e.userId, (m) =>
        m.sharingEnabled === sharingEnabled
          ? m
          : { ...m, sharingEnabled, presence: presenceFor({ lastSeenAt: m.lastSeenAt, now, sharingEnabled }) },
      );
    },

    applyHealth(signal: HealthSignal) {
      if (!signal.activity) return;
      const activity = signal.activity;
      put(signal.userId, (m) => (m.activity === activity ? m : { ...m, activity }));
    },

    applyAlert(alert: Pick<SafetyAlert, "id" | "affectedUserId" | "status" | "escalationState" | "resolvedAt">) {
      const set = openAlerts.get(alert.affectedUserId) ?? new Set();
      openAlerts.set(alert.affectedUserId, set);
      const resolved = alert.status === "resolved" || Boolean(alert.resolvedAt) ||
        alert.escalationState === "RESOLVED" || alert.escalationState === "CANCELLED";
      if (resolved) set.delete(alert.id);
      else set.add(alert.id);
      const possibleConcern = set.size > 0;
      put(alert.affectedUserId, (m) => (m.possibleConcern === possibleConcern ? m : { ...m, possibleConcern }));
    },

    /** Recompute presence buckets (live → stale → offline). Only changed entries are replaced. */
    tick(now = Date.now()) {
      for (const m of members.values()) {
        const presence = presenceFor({ lastSeenAt: m.lastSeenAt, now, sharingEnabled: m.sharingEnabled });
        if (presence !== m.presence) put(m.userId, (cur) => ({ ...cur, presence }));
      }
    },

    setRoute(next: Route | null) {
      route = next;
      for (const m of members.values()) put(m.userId, (cur) => ({ ...cur, routeStatus: statusFor(cur.userId, cur.position) }));
    },

    clearTrails() {
      for (const m of members.values()) {
        if (m.trail.length > 1) put(m.userId, (cur) => ({ ...cur, trail: cur.position ? [cur.position] : [] }));
      }
    },

    subscribe(userId: string, listener: Listener): () => void {
      const set = listeners.get(userId) ?? new Set();
      listeners.set(userId, set);
      set.add(listener);
      return () => set.delete(listener);
    },
    subscribeIds(listener: Listener): () => void {
      listListeners.add(listener);
      return () => listListeners.delete(listener);
    },
  };
}

export type MemberStore = ReturnType<typeof createMemberStore>;

import { describe, expect, it } from "vitest";
import type { LocationUpdate } from "@/lib/types";
import { applyLocationUpdate, applyMemberStatus, mergeDbRows, type LiveLocationView } from "./liveLocationMerge";

const T0 = Date.parse("2026-10-17T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const row = (user_id: string, at: number, sharing_enabled = true): LiveLocationView => ({
  user_id,
  last_seen_at: iso(at),
  sharing_enabled,
  activity: "walking",
});
const update = (userId: string, activity?: string): LocationUpdate => ({
  jamId: "jam",
  userId,
  latitude: 43.66,
  longitude: -79.39,
  activity,
  // A sender clock far behind ours must not make the member look stale.
  timestamp: iso(T0 - 10 * 60_000),
});

describe("applyLocationUpdate", () => {
  it("adds a member seen only through broadcasts (no live_locations row yet)", () => {
    const next = applyLocationUpdate(new Map(), update("a", "walking"), T0);
    expect(next.get("a")).toEqual({ user_id: "a", last_seen_at: iso(T0), sharing_enabled: true, activity: "walking" });
  });

  it("uses the receive time, not the sender's timestamp", () => {
    expect(applyLocationUpdate(new Map(), update("a"), T0).get("a")?.last_seen_at).toBe(iso(T0));
  });

  it("keeps the previous activity when the update has none, and re-enables sharing", () => {
    const current = new Map([["a", { ...row("a", T0 - 5_000, false), activity: "running" }]]);
    expect(applyLocationUpdate(current, update("a"), T0).get("a")).toMatchObject({ activity: "running", sharing_enabled: true });
  });

  it("does not mutate the current map", () => {
    const current = new Map<string, LiveLocationView>();
    applyLocationUpdate(current, update("a"), T0);
    expect(current.size).toBe(0);
  });
});

describe("mergeDbRows", () => {
  it("loads rows into an empty map", () => {
    const next = mergeDbRows(new Map(), [row("a", T0), row("b", T0 - 1_000)]);
    expect([...next.keys()]).toEqual(["a", "b"]);
  });

  it("never lets an older DB row overwrite a fresher broadcast", () => {
    const live = applyLocationUpdate(new Map(), update("a"), T0);
    const next = mergeDbRows(live, [row("a", T0 - 9_000)]);
    expect(next.get("a")?.last_seen_at).toBe(iso(T0));
  });

  it("takes a newer DB row", () => {
    const next = mergeDbRows(new Map([["a", row("a", T0)]]), [row("a", T0 + 5_000, false)]);
    expect(next.get("a")).toMatchObject({ last_seen_at: iso(T0 + 5_000), sharing_enabled: false });
  });

  it("keeps broadcast-only members that have no row yet", () => {
    const live = applyLocationUpdate(new Map(), update("a"), T0);
    expect(mergeDbRows(live, []).get("a")).toBeDefined();
  });
});

describe("applyMemberStatus", () => {
  it("marks a member paused / resumed", () => {
    const current = new Map([["a", row("a", T0)]]);
    const paused = applyMemberStatus(current, { jamId: "jam", userId: "a", sharingEnabled: false, timestamp: iso(T0) });
    expect(paused.get("a")).toMatchObject({ sharing_enabled: false, last_seen_at: iso(T0) });
    const resumed = applyMemberStatus(paused, { jamId: "jam", userId: "a", sharingEnabled: true, timestamp: iso(T0) });
    expect(resumed.get("a")?.sharing_enabled).toBe(true);
  });

  it("ignores events without sharingEnabled (presence hints, route status)", () => {
    const current = new Map([["a", row("a", T0)]]);
    expect(applyMemberStatus(current, { jamId: "jam", userId: "a", presence: "offline", timestamp: iso(T0) })).toBe(current);
  });
});

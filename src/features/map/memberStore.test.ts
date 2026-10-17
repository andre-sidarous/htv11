import { describe, expect, it, vi } from "vitest";
import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import type { LocationUpdate } from "@/lib/types";
import { createMemberStore, TRAIL_MAX_POINTS } from "./memberStore";

const NOW = 1_000_000;
const update = (userId: string, latitude = 43.6597, longitude = -79.3972): LocationUpdate => ({
  jamId: "jam",
  userId,
  latitude,
  longitude,
  activity: "walking",
  timestamp: new Date(NOW).toISOString(),
});

describe("createMemberStore", () => {
  it("only notifies the member that changed", () => {
    const store = createMemberStore();
    store.applyLocation(update("a"), NOW);
    store.applyLocation(update("b"), NOW);
    const onA = vi.fn();
    const onB = vi.fn();
    store.subscribe("a", onA);
    store.subscribe("b", onB);

    store.applyLocation(update("a", 43.66), NOW + 4_000);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
  });

  it("keeps the id list stable unless membership changes", () => {
    const store = createMemberStore();
    store.applyLocation(update("a"), NOW);
    const ids = store.ids();
    store.applyLocation(update("a", 43.66), NOW + 1);
    expect(store.ids()).toBe(ids);
    store.applyLocation(update("b"), NOW + 2);
    expect(store.ids()).toEqual(["a", "b"]);
  });

  it("computes route status from the shared route", () => {
    const store = createMemberStore();
    store.setRoute(toDemoRoute(campusWalk.plannedRoute));
    const end = campusWalk.affectedUserOffRoutePath[campusWalk.affectedUserOffRoutePath.length - 1]!;
    store.applyLocation(update("alex", end.latitude, end.longitude), NOW);
    expect(store.get("alex")?.routeStatus?.level).toBe("significant_deviation");
  });

  it("caps the breadcrumb trail and can clear it", () => {
    const store = createMemberStore();
    for (let i = 0; i < TRAIL_MAX_POINTS + 20; i++) store.applyLocation(update("a", 43.65 + i / 1e5), NOW + i);
    expect(store.get("a")?.trail).toHaveLength(TRAIL_MAX_POINTS);
    store.clearTrails();
    expect(store.get("a")?.trail).toHaveLength(1);
  });

  it("goes live → stale → offline on tick without declaring anything else", () => {
    const store = createMemberStore();
    store.applyLocation(update("a"), NOW);
    expect(store.get("a")?.presence).toBe("live");
    store.tick(NOW + 31_000);
    expect(store.get("a")?.presence).toBe("stale");
    store.tick(NOW + 61_000);
    expect(store.get("a")?.presence).toBe("offline");
    expect(store.get("a")?.possibleConcern).toBe(false);
  });

  it("ignores broadcast presence and only applies sharingEnabled", () => {
    const store = createMemberStore();
    store.applyLocation(update("a"), NOW);
    store.applyStatus({ jamId: "jam", userId: "a", presence: "offline", timestamp: "t" }, NOW);
    expect(store.get("a")?.presence).toBe("live");
    store.applyStatus({ jamId: "jam", userId: "a", sharingEnabled: false, timestamp: "t" }, NOW);
    expect(store.get("a")?.presence).toBe("paused");
  });

  it("uses the stored last_seen_at for rows loaded from the database", () => {
    const store = createMemberStore();
    store.applyLocation(update("a"), NOW, NOW - 45_000);
    expect(store.get("a")?.presence).toBe("stale");
  });

  it("labels a possible concern while an alert is open", () => {
    const store = createMemberStore();
    const alert = { id: "al1", affectedUserId: "a", status: "group_alert" as const, escalationState: "GROUP_ALERT_SENT" as const, resolvedAt: null };
    store.applyAlert(alert);
    expect(store.get("a")?.possibleConcern).toBe(true);
    store.applyAlert({ ...alert, status: "resolved", escalationState: "RESOLVED", resolvedAt: "2026-10-17T12:00:00Z" });
    expect(store.get("a")?.possibleConcern).toBe(false);
  });
});

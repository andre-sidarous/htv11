import { describe, expect, it } from "vitest";
import { PRESENCE_OFFLINE_AFTER_MS, PRESENCE_STALE_AFTER_MS } from "@/lib/constants";
import { formatAgo, presenceFor, presenceLabel } from "./presence";

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("presenceFor", () => {
  it("is live under 30s", () => {
    expect(presenceFor({ lastSeenAt: ago(0), now: NOW })).toBe("live");
    expect(presenceFor({ lastSeenAt: ago(PRESENCE_STALE_AFTER_MS - 1), now: NOW })).toBe("live");
  });

  it("is stale from 30s and offline from 60s", () => {
    expect(presenceFor({ lastSeenAt: ago(PRESENCE_STALE_AFTER_MS), now: NOW })).toBe("stale");
    expect(presenceFor({ lastSeenAt: ago(PRESENCE_OFFLINE_AFTER_MS - 1), now: NOW })).toBe("stale");
    expect(presenceFor({ lastSeenAt: ago(PRESENCE_OFFLINE_AFTER_MS), now: NOW })).toBe("offline");
  });

  it("accepts epoch milliseconds", () => {
    expect(presenceFor({ lastSeenAt: NOW - 45_000, now: NOW })).toBe("stale");
  });

  it("reports paused before anything else", () => {
    expect(presenceFor({ lastSeenAt: ago(0), now: NOW, sharingEnabled: false })).toBe("paused");
  });

  it("is unavailable with no update, a bad timestamp, or a device error", () => {
    expect(presenceFor({ lastSeenAt: null, now: NOW })).toBe("unavailable");
    expect(presenceFor({ lastSeenAt: "not a date", now: NOW })).toBe("unavailable");
    expect(presenceFor({ lastSeenAt: ago(0), now: NOW, unavailable: true })).toBe("unavailable");
  });
});

describe("presenceLabel", () => {
  it("uses calm status labels and never mentions danger", () => {
    expect(presenceLabel("live", ago(0), NOW)).toBe("Live");
    expect(presenceLabel("stale", ago(42_000), NOW)).toBe("Last updated 42 seconds ago");
    expect(presenceLabel("paused", ago(0), NOW)).toBe("Location paused");
    expect(presenceLabel("unavailable", null, NOW)).toBe("Location unavailable");
    expect(presenceLabel("offline", ago(90_000), NOW)).toBe("Connection lost");
    for (const p of ["live", "stale", "offline", "paused", "unavailable"] as const) {
      expect(presenceLabel(p, ago(120_000), NOW)).not.toMatch(/danger|unsafe|emergency/i);
    }
  });
});

describe("formatAgo", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatAgo(1_000)).toBe("1 second ago");
    expect(formatAgo(4_000)).toBe("4 seconds ago");
    expect(formatAgo(-500)).toBe("0 seconds ago");
    expect(formatAgo(60_000)).toBe("1 minute ago");
    expect(formatAgo(5 * 60_000)).toBe("5 minutes ago");
    expect(formatAgo(2 * 3_600_000)).toBe("2 hours ago");
  });
});

import { describe, expect, it } from "vitest";
import { escalationLine, formatAgo, formatRemaining, responseStatus } from "./presentation";

describe("responseStatus", () => {
  it("is New with no responses", () => expect(responseStatus([], false)).toBe("New"));
  it("takes the furthest response", () => expect(responseStatus(["seen", "responding", "acknowledged"], false)).toBe("Responding"));
  it("is Resolved once resolved", () => expect(responseStatus(["seen"], true)).toBe("Resolved"));
});

describe("escalationLine", () => {
  it("uses calm copy at each step", () => {
    expect(escalationLine("CHECK_IN_SENT", "Alex")).toBe("Huddle noticed a combination of changes and is checking in with Alex.");
    expect(escalationLine("GROUP_ALERT_SENT", "Alex")).toContain("Your group has been notified");
    expect(escalationLine("CONTACTS_NOTIFIED", "Alex")).toContain("trusted contacts are being called");
  });
  it("never shouts", () => {
    const states = ["MONITORING", "CHECK_IN_SENT", "GROUP_ALERT_SENT", "AI_CALL_ACTIVE", "CONTACTS_NOTIFIED", "RESOLVED"] as const;
    for (const s of states) expect(escalationLine(s, "Alex")).not.toMatch(/DANGER|UNSAFE|!/);
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  it("formats seconds, minutes, hours", () => {
    expect(formatAgo("2026-10-17T11:59:58Z", now)).toBe("just now");
    expect(formatAgo("2026-10-17T11:59:18Z", now)).toBe("42 seconds ago");
    expect(formatAgo("2026-10-17T11:59:00Z", now)).toBe("1 minute ago");
    expect(formatAgo("2026-10-17T11:57:00Z", now)).toBe("3 minutes ago");
    expect(formatAgo("2026-10-17T10:00:00Z", now)).toBe("2 hours ago");
  });
  it("handles missing", () => expect(formatAgo(null, now)).toBe("unknown"));
});

describe("formatRemaining", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  it("formats time left", () => {
    expect(formatRemaining("2026-10-18T11:00:00Z", now)).toBe("about 23 hours");
    expect(formatRemaining("2026-10-17T12:40:00Z", now)).toBe("40 minutes");
    expect(formatRemaining("2026-10-17T11:00:00Z", now)).toBe("expired");
  });
});

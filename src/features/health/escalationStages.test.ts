import { describe, expect, it } from "vitest";
import { timelineFor } from "./escalationStages";

const statuses = (t: ReturnType<typeof timelineFor>) => t.stages.map((s) => s.status);

describe("timelineFor", () => {
  it("shows monitoring when there is no alert", () => {
    expect(statuses(timelineFor(null))).toEqual(["active", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("marks earlier stages done and the current one active", () => {
    expect(statuses(timelineFor("GROUP_ALERT_SENT"))).toEqual(["done", "done", "active", "upcoming", "upcoming"]);
    expect(statuses(timelineFor("CONTACTS_NOTIFIED"))).toEqual(["done", "done", "done", "done", "active"]);
  });

  it("stops at the stage where someone answered", () => {
    expect(statuses(timelineFor("GROUP_MEMBER_ACKNOWLEDGED"))).toEqual(["done", "done", "settled", "skipped", "skipped"]);
    expect(timelineFor("USER_RESPONDED").next).toMatch(/closes/);
  });

  it("skips the AI call for contact-only preferences", () => {
    const t = timelineFor("GROUP_ALERT_SENT", false);
    expect(statuses(t)).toEqual(["done", "done", "active", "skipped", "upcoming"]);
    expect(t.next).toMatch(/trusted contacts/);
    expect(statuses(timelineFor("CONTACTS_NOTIFIED", false))[3]).toBe("skipped");
  });
});

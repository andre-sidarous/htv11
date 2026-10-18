import { describe, expect, it } from "vitest";
import { pickGuideTarget, walkingDirectionsUrl, type GuideCandidate } from "./guideTarget";

const me = { latitude: 43.6629, longitude: -79.3957 };
const member = (userId: string, lat: number, presence = "live", isActive = true): GuideCandidate => ({
  userId,
  name: userId.toUpperCase(),
  position: { latitude: lat, longitude: -79.3957 },
  presence,
  isActive,
});

describe("pickGuideTarget", () => {
  const members = [member("self", 43.6629), member("near", 43.664), member("far", 43.67), member("gone", 43.6631, "live", false)];

  it("finds a specific member", () => {
    const t = pickGuideTarget({ kind: "member", userId: "far", name: "FAR" }, me, "self", members);
    expect(t?.userId).toBe("far");
    expect(t?.distanceM).toBeGreaterThan(700);
  });

  it("guides the lost person to the nearest active member, never themselves or someone who left", () => {
    expect(pickGuideTarget({ kind: "group" }, me, "self", members)?.userId).toBe("near");
  });

  it("prefers live members over offline ones", () => {
    const t = pickGuideTarget({ kind: "group" }, me, "self", [member("near", 43.664, "offline"), member("far", 43.67)]);
    expect(t?.userId).toBe("far");
  });

  it("returns null without my position or anyone to go to", () => {
    expect(pickGuideTarget({ kind: "group" }, null, "self", members)).toBeNull();
    expect(pickGuideTarget({ kind: "group" }, me, "self", [member("self", 43.6629)])).toBeNull();
    expect(pickGuideTarget(null, me, "self", members)).toBeNull();
  });

  it("builds a Google Maps walking link", () => {
    expect(walkingDirectionsUrl({ latitude: 43.664, longitude: -79.3957 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=43.664000,-79.395700&travelmode=walking",
    );
  });
});

import { describe, expect, it } from "vitest";
import { describeSharing, emptyContactForm, validateContact } from "./schema";

const base = { ...emptyContactForm, name: "Sam" };

describe("validateContact", () => {
  it("requires a name", () => {
    const result = validateContact({ ...emptyContactForm, email: "sam@example.com" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("Add a name.");
  });

  it("requires a phone or an email", () => {
    const result = validateContact(base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.phone_number).toMatch(/phone number so Jam can call them/);
  });

  it("turns blank optional fields into null and trims", () => {
    const result = validateContact({ ...base, name: "  Sam ", email: " Sam@Example.com " });
    expect(result).toEqual({
      ok: true,
      data: {
        name: "Sam",
        relationship: null,
        phone_number: null,
        email: "sam@example.com",
        receive_location: false,
        receive_health_summary: false,
        receive_recording: false,
        confirmation_status: "pending",
      },
    });
  });

  it("normalizes phones to E.164 for calling", () => {
    const ok = validateContact({ ...base, phone_number: "+1 (416) 555-0123" });
    expect(ok.ok && ok.data.phone_number).toBe("+14165550123");
  });

  it("rejects phones without a country code, and junk", () => {
    for (const phone of ["416 555 0123", "call me"]) {
      const bad = validateContact({ ...base, phone_number: phone });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.errors.phone_number).toMatch(/country code/);
    }
  });

  it("rejects a malformed email", () => {
    const result = validateContact({ ...base, email: "sam@" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.email).toMatch(/doesn't look right/);
  });

  it("defaults to sharing nothing", () => {
    expect(emptyContactForm.receive_location || emptyContactForm.receive_health_summary || emptyContactForm.receive_recording).toBe(false);
  });
});

describe("describeSharing", () => {
  const none = { receive_location: false, receive_health_summary: false, receive_recording: false };

  it("says when nothing is shared", () => {
    expect(describeSharing(none)).toBe("Nothing is shared with them yet.");
  });

  it("lists one, two, or three items naturally", () => {
    expect(describeSharing({ ...none, receive_location: true })).toBe("If Jam can't reach you, they can see your location.");
    expect(describeSharing({ ...none, receive_location: true, receive_recording: true })).toBe(
      "If Jam can't reach you, they can see your location and recording.",
    );
    expect(describeSharing({ receive_location: true, receive_health_summary: true, receive_recording: true })).toBe(
      "If Jam can't reach you, they can see your location, health summary and recording.",
    );
  });
});

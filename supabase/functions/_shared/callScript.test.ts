// deno test supabase/functions/_shared/callScript.test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildCallMessage, buildSmsMessage, buildTwiml, describePlace, toE164 } from "./callScript.ts";

Deno.test("message includes only what the contact may receive", () => {
  const bare = buildCallMessage({ contactName: "Sam", personName: "Alex" });
  assertStringIncludes(bare, "Alex may need support");
  assert(!bare.includes("location"), "no location without permission");
  assert(!bare.includes("Huddle noticed"), "no reasons without permission");

  const full = buildCallMessage({
    contactName: "Sam",
    personName: "Alex",
    placeDescription: "near Robarts Library, St. George Street",
    reasons: ["Heart rate is 93% above personal baseline.", "Unexpected running detected.", "Third reason."],
  });
  assertStringIncludes(full, "Their last known location was near Robarts Library, St. George Street.");
  assertStringIncludes(full, "Huddle noticed: Heart rate is 93% above personal baseline, and Unexpected running detected.");
  assert(!full.includes("Third reason"), "at most two reasons");
  assertStringIncludes(full, "call 9 1 1");
});

Deno.test("TwiML escapes names and repeats the message", () => {
  const twiml = buildTwiml(buildCallMessage({ contactName: "Sam & Co <x>", personName: "Alex" }));
  assertStringIncludes(twiml, "Sam &amp; Co &lt;x&gt;");
  assertEquals(twiml.match(/<Say /g)?.length, 2);
});

Deno.test("toE164 normalizes and rejects", () => {
  assertEquals(toE164("+1 (416) 555-0123"), "+14165550123");
  assertEquals(toE164("416 555 0123"), "+14165550123");
  assertEquals(toE164("14165550123"), "+14165550123");
  assertEquals(toE164("555 0123"), null);
  assertEquals(toE164("+0123"), null);
  assertEquals(toE164(null), null);
});

Deno.test("describePlace prefers landmark + street", () => {
  assertEquals(
    describePlace({ name: "Robarts Library", address: { road: "St. George Street", neighbourhood: "University" } }),
    "near Robarts Library, St. George Street",
  );
  assertEquals(describePlace({ address: { road: "Harbord Street", neighbourhood: "Harbord Village" } }), "on Harbord Street, Harbord Village");
  assertEquals(describePlace({ address: {} }), null);
  assertEquals(describePlace(null), null);
});

Deno.test("text includes only what the contact may receive", () => {
  const bare = buildSmsMessage({ personName: "Alex" });
  assertStringIncludes(bare, "Alex may need support");
  assert(!bare.includes("maps.google.com"), "no location without permission");
  assert(!bare.includes("recording"), "no recording without permission");

  const full = buildSmsMessage({
    personName: "Alex",
    location: { latitude: 43.664512, longitude: -79.399876, placeDescription: "near Robarts Library", minutesAgo: 2 },
    reasons: ["Unexpected running detected."],
    recordingUrl: "https://example.supabase.co/storage/v1/object/sign/recordings/u/a.m4a?token=x",
  });
  assertStringIncludes(full, "Last seen near Robarts Library (2 min ago): https://maps.google.com/?q=43.66451,-79.39988");
  assertStringIncludes(full, "Huddle noticed: Unexpected running detected.");
  assertStringIncludes(full, "recording (link expires in 24 hours)");
  assertStringIncludes(full, "call 911");
});

Deno.test("call mentions the text only when one follows", () => {
  assert(!buildCallMessage({ contactName: "Sam", personName: "Alex" }).includes("text message"));
  assertStringIncludes(buildCallMessage({ contactName: "Sam", personName: "Alex", textFollows: true }), "text message");
});

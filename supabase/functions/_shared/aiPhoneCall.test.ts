// deno test --allow-env supabase/functions/_shared/aiPhoneCall.test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { callSignature, describeSteps, gather, keywordIntent, scriptedTurn, spokenDistance, verifyCallSignature } from "./aiPhoneCall.ts";

Deno.test("directions read like a person giving them", () => {
  const text = describeSteps(
    [
      { distance: 210, name: "St. George Street", maneuver: { type: "depart", bearing_after: 2 } },
      { distance: 350, name: "Harbord Street", maneuver: { type: "turn", modifier: "left" } },
      { distance: 0, name: "", maneuver: { type: "arrive" } },
    ],
    "St. George Station",
  );
  assertEquals(text, "Head north on St. George Street for about 200 metres, then turn left onto Harbord Street, and you'll reach St. George Station.");
  const last = describeSteps(
    [
      { distance: 120, name: "Bloor Street West", maneuver: { type: "depart", bearing_after: 90 } },
      { distance: 0, name: "", maneuver: { type: "arrive" } },
    ],
    "St. George Station",
  );
  assertEquals(last, "Head east on Bloor Street West for about 100 metres, and you'll reach St. George Station.");
  const unnamedFirst = describeSteps(
    [
      { distance: 25, name: "", maneuver: { type: "depart", bearing_after: 180 } },
      { distance: 90, name: "", maneuver: { type: "turn", modifier: "sharp right" } },
      { distance: 300, name: "Harbord Street", maneuver: { type: "turn", modifier: "right" } },
      { distance: 200, name: "Harbord Street", maneuver: { type: "continue" } },
      { distance: 150, name: "Spadina Avenue", maneuver: { type: "turn", modifier: "left" } },
      { distance: 0, name: "", maneuver: { type: "arrive" } },
    ],
    null,
  );
  assertEquals(unnamedFirst, "Head south for about 100 metres to Harbord Street, then turn right onto it.");
  const noNames = describeSteps(
    [
      { distance: 180, name: "", maneuver: { type: "depart", bearing_after: 270 } },
      { distance: 0, name: "", maneuver: { type: "arrive" } },
    ],
    "the fountain",
  );
  assertEquals(noNames, "Head west for about 200 metres, and you'll reach the fountain.");
});

Deno.test("keyword intent fallback", () => {
  assertEquals(keywordIntent("yeah I'm okay"), "safe");
  assertEquals(keywordIntent("I think someone is following me, help"), "help");
  assertEquals(keywordIntent("I made it, I'm at the station"), "arrived");
  assertEquals(keywordIntent("where am I"), "continue");
});

Deno.test("spoken distances", () => {
  assertEquals(spokenDistance(42), "about 40 metres");
  assertEquals(spokenDistance(1234), "about 1.2 kilometres");
});

Deno.test("scripted lines carry the directions", () => {
  const k = { name: "Alex", destination: "St. George Station", directions: "Head east for about 400 metres.", remaining: null, places: [], fewPlaces: false, locationAgeMin: 0, reasons: [] };
  assertStringIncludes(scriptedTurn(k, "greeting", "continue"), "Are you okay?");
  assertStringIncludes(scriptedTurn(k, "greeting", "continue"), "Head east for about 400 metres.");
  assertStringIncludes(scriptedTurn(k, "reply", "help"), "trusted contacts");
});

Deno.test("signature is per alert", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-secret");
  const a = "00000000-0000-4000-8000-000000000001";
  const sig = await callSignature(a);
  assert(await verifyCallSignature(a, sig));
  assert(!(await verifyCallSignature("00000000-0000-4000-8000-000000000002", sig)));
  assert(!(await verifyCallSignature(a, null)));
});

Deno.test("gather listens for speech or a key and escapes text", () => {
  const xml = gather("Hi <Alex> & co", "https://x/y?a=1&b=2", "yes, help");
  assertStringIncludes(xml, 'input="speech dtmf"');
  assertStringIncludes(xml, "Hi &lt;Alex&gt; &amp; co");
  assertStringIncludes(xml, "a=1&amp;b=2");
});

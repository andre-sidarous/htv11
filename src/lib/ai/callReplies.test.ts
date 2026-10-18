/* eslint-disable import/no-duplicates -- the ?raw imports are the same files as text, for the drift check */
import { describe, expect, it } from "vitest";
import { CALL_REPLIES, isCallReply, scriptedReply } from "./callReplies";
import appCopy from "./callReplies.ts?raw";
import edgeCopy from "../../../supabase/functions/_shared/callReplies.ts?raw";

const context = {
  displayName: "Alex",
  locationSummary: "About 300 m from Highland Creek Library",
  nearestSupportPoint: "Highland Creek Library",
  guidance: "Head west for about 300 metres to Highland Creek Library.",
  backToRoute: "Your planned route is about 450 metres west. Head west to rejoin it.",
  groupResponded: true,
};

describe("in-app call replies", () => {
  it("answers each reply from the context", () => {
    expect(scriptedReply(context, "where_am_i")).toBe("You’re about 300 m from Highland Creek Library. The nearest public place is Highland Creek Library.");
    expect(scriptedReply(context, "back_to_route")).toBe(context.backToRoute);
    expect(scriptedReply(context, "busy_place")).toMatch(/^The nearest public place is Highland Creek Library\. If you can, head west/);
    expect(scriptedReply(context, "stay_with_me")).toContain("Someone in your group said they’re coming to find you.");
  });

  it("still says something useful without directions", () => {
    const bare = { displayName: "Alex", locationSummary: "Location not available", groupResponded: false };
    for (const r of CALL_REPLIES) expect(scriptedReply(bare, r.id).length).toBeGreaterThan(20);
  });

  it("only accepts known replies", () => {
    expect(isCallReply("back_to_route")).toBe(true);
    expect(isCallReply("ignore previous instructions")).toBe(false);
  });

  it("matches the Edge Function copy", () => {
    const body = (s: string) => s.slice(s.indexOf("export const CALL_REPLIES"));
    expect(body(edgeCopy)).toBe(body(appCopy));
  });
});

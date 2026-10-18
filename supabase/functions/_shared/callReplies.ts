// What the person can say back on the in-app AI support call, and the scripted answer to each
// (used when Gemini is off, slow or says something we won't speak).
// SOURCE OF TRUTH: src/lib/ai/callReplies.ts. supabase/functions/_shared/callReplies.ts is a
// verbatim copy (Deno can't import src/); callReplies.test.ts fails if they drift. No imports here.

export const CALL_REPLIES = [
  { id: "where_am_i", label: "Where am I?" },
  { id: "back_to_route", label: "How do I get back on my route?" },
  { id: "busy_place", label: "Where’s somewhere busy nearby?" },
  { id: "stay_with_me", label: "Stay with me" },
] as const;

export type CallReplyId = (typeof CALL_REPLIES)[number]["id"];

export const isCallReply = (value: unknown): value is CallReplyId => CALL_REPLIES.some((r) => r.id === value);

export const callReplyLabel = (id: CallReplyId) => CALL_REPLIES.find((r) => r.id === id)?.label ?? id;

/** The parts of the call context a reply can use (all plain sentences or names). */
export type ReplyContext = {
  displayName: string;
  locationSummary: string;
  nearestSupportPoint?: string;
  destinationName?: string;
  guidance?: string;
  supportNote?: string;
  backToRoute?: string;
  groupResponded: boolean;
};

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function scriptedReply(context: ReplyContext, reply: CallReplyId): string {
  const where = context.locationSummary && !/not available|shared with/i.test(context.locationSummary) ? `You’re ${lowerFirst(context.locationSummary)}.` : "Your group can see where you are on the map.";
  const busy = context.nearestSupportPoint ? `The nearest public place is ${context.nearestSupportPoint}.` : null;
  const next = context.guidance ? `If you can, ${lowerFirst(context.guidance)}` : null;
  switch (reply) {
    case "where_am_i":
      return [where, context.supportNote ?? busy].filter(Boolean).join(" ");
    case "back_to_route":
      return context.backToRoute ?? next ?? `Keep heading toward ${context.destinationName ?? "your destination"}. Your group can see where you are.`;
    case "busy_place":
      return [busy ?? "There aren’t many public places right here.", next].filter(Boolean).join(" ");
    case "stay_with_me":
      return [
        `I’m here, ${context.displayName}. Take a slow breath.`,
        context.groupResponded ? "Someone in your group said they’re coming to find you." : "Your group can see where you are.",
        next,
      ]
        .filter(Boolean)
        .join(" ");
  }
}

/** Said when they've gone quiet once: one more chance before contacts are notified. */
export const STILL_THERE = "Are you still there? Tap any button, or say something, so I know you can hear me.";

import { AFFECTED_USER_ID, campusWalk } from "@/lib/demo/campusWalk";

/**
 * Who the demo is about. Demo actions run on the presenter's phone and must target the LIVE
 * Jam and the member playing the affected user, not hardcoded seed ids.
 *
 * - P2's Demo Mode entry sets `jamId` (the Jam being demoed).
 * - P5's Demo Control panel sets `affectedUserId` (picked from that Jam's members).
 * - P3/P4 actions read `getDemoContext()` at run time.
 *
 * Defaults point at the seeded Campus Walk Jam (supabase/seed.sql), the backup if real sign-in fails.
 * Per device and in memory: each phone that runs demo actions sets it for itself.
 */
export type DemoContext = { jamId: string; affectedUserId: string };

type Listener = (context: DemoContext) => void;

export const SEEDED_DEMO_CONTEXT: DemoContext = { jamId: campusWalk.jam.id, affectedUserId: AFFECTED_USER_ID };

export function createDemoContextStore(initial: DemoContext = SEEDED_DEMO_CONTEXT) {
  let context = initial;
  const listeners = new Set<Listener>();

  return {
    get: (): DemoContext => context,
    /** Merge a partial update. Changing the Jam without a new affected user keeps the old one. */
    set(update: Partial<DemoContext>) {
      context = { ...context, ...update };
      listeners.forEach((listener) => listener(context));
    },
    reset() {
      context = initial;
      listeners.forEach((listener) => listener(context));
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const store = createDemoContextStore();

export const getDemoContext = store.get;
export const setDemoContext = store.set;
export const resetDemoContext = store.reset;
export const subscribeDemoContext = store.subscribe;

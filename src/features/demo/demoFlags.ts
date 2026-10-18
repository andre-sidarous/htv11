import { useSyncExternalStore } from "react";

/**
 * Per-phone demo switches, set by Demo Control's automated story (directly on the presenter's
 * phone, and on every other phone through the `demo_story` broadcast). Never persisted: an app
 * restart or "Reset demo" goes back to normal behaviour.
 */
type DemoFlags = {
  /** The story is running (narration on the presenter's phone). */
  storyRunning: boolean;
  /** Run the AI support call inside the app (spoken + on screen) instead of ringing the real phone. */
  inAppCall: boolean;
};

let flags: DemoFlags = { storyRunning: false, inAppCall: false };
const listeners = new Set<() => void>();

export const demoFlags = {
  get: () => flags,
  set(patch: Partial<DemoFlags>) {
    flags = { ...flags, ...patch };
    listeners.forEach((l) => l());
  },
  reset() {
    demoFlags.set({ storyRunning: false, inAppCall: false });
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useDemoFlags = () => useSyncExternalStore(demoFlags.subscribe, demoFlags.get, demoFlags.get);

import { describe, expect, it, vi } from "vitest";
import { createDemoContextStore, SEEDED_DEMO_CONTEXT } from "./demoContext";

describe("demo context", () => {
  it("defaults to the seeded Campus Walk", () => {
    expect(createDemoContextStore().get()).toEqual(SEEDED_DEMO_CONTEXT);
  });

  it("merges partial updates and notifies", () => {
    const store = createDemoContextStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ jamId: "live-jam" });
    expect(store.get()).toEqual({ jamId: "live-jam", affectedUserId: SEEDED_DEMO_CONTEXT.affectedUserId });

    store.set({ affectedUserId: "real-user" });
    expect(store.get()).toEqual({ jamId: "live-jam", affectedUserId: "real-user" });
    expect(listener).toHaveBeenCalledTimes(2);

    store.reset();
    expect(store.get()).toEqual(SEEDED_DEMO_CONTEXT);
  });
});

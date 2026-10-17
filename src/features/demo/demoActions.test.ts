import { describe, expect, it, vi } from "vitest";
import { createDemoActionRegistry } from "./demoActions";

describe("demoActions registry", () => {
  it("registers, lists, runs, and unregisters", async () => {
    const registry = createDemoActionRegistry();
    const run = vi.fn(async () => {});
    const unregister = registry.register({ id: "a", label: "A", owner: "map", run });

    expect(registry.list().map((a) => a.id)).toEqual(["a"]);
    await registry.run("a");
    expect(run).toHaveBeenCalledOnce();

    unregister();
    expect(registry.has("a")).toBe(false);
  });

  it("rejects unknown ids", async () => {
    await expect(createDemoActionRegistry().run("missing")).rejects.toThrow(/not registered/);
  });

  it("keeps list() referentially stable between changes and notifies subscribers", () => {
    const registry = createDemoActionRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const before = registry.list();
    expect(registry.list()).toBe(before);

    registry.register({ id: "b", label: "B", owner: "health", run: async () => {} });
    expect(listener).toHaveBeenCalledOnce();
    expect(registry.list()).not.toBe(before);
  });

  it("a stale unregister doesn't remove a replacement", () => {
    const registry = createDemoActionRegistry();
    const first = registry.register({ id: "c", label: "C1", owner: "alerts", run: async () => {} });
    registry.register({ id: "c", label: "C2", owner: "alerts", run: async () => {} });
    first();
    expect(registry.list()[0]?.label).toBe("C2");
  });
});

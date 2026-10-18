import { describe, expect, it } from "vitest";
import { runStory, type StoryProgress, type StoryStep } from "./storyRunner";

const fakeClock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
};

const step = (id: string, delayMs: number, run: () => Promise<void> = async () => {}): StoryStep => ({ id, title: id, narration: id, delayMs, run });

describe("runStory", () => {
  it("runs every step in order after its delay", async () => {
    const clock = fakeClock();
    const order: string[] = [];
    const at: number[] = [];
    const result = await runStory(
      [step("a", 5_000, async () => void (order.push("a"), at.push(clock.now()))), step("b", 6_000, async () => void (order.push("b"), at.push(clock.now())))],
      { onProgress: () => {}, isCancelled: () => false, ...clock },
    );
    expect(order).toEqual(["a", "b"]);
    expect(at).toEqual([5_000, 11_000]);
    expect(result.statuses).toEqual(["done", "done"]);
    expect(result.finished).toBe(true);
  });

  it("reports a countdown while waiting", async () => {
    const clock = fakeClock();
    const seen: StoryProgress[] = [];
    await runStory([step("a", 5_000)], { onProgress: (p) => seen.push(p), isCancelled: () => false, ...clock });
    expect(seen[0]).toMatchObject({ current: 0, startsAt: 5_000, statuses: ["waiting"] });
  });

  it("stops on cancel and marks the rest skipped", async () => {
    const clock = fakeClock();
    let cancel = false;
    const ran: string[] = [];
    const result = await runStory(
      [step("a", 0, async () => void (ran.push("a"), (cancel = true))), step("b", 1_000, async () => void ran.push("b"))],
      { onProgress: () => {}, isCancelled: () => cancel, ...clock },
    );
    expect(ran).toEqual(["a"]);
    expect(result.statuses).toEqual(["done", "skipped"]);
  });

  it("stops at a failed step with its reason, or continues when asked", async () => {
    const clock = fakeClock();
    const failing = step("boom", 0, async () => {
      throw new Error("no alert");
    });
    const stopped = await runStory([failing, step("after", 0)], { onProgress: () => {}, isCancelled: () => false, ...clock });
    expect(stopped.statuses).toEqual(["failed", "skipped"]);
    expect(stopped.error).toBe("boom: no alert");
    const kept = await runStory([failing, step("after", 0)], { onProgress: () => {}, isCancelled: () => false, continueOnError: true, ...clock });
    expect(kept.statuses).toEqual(["failed", "done"]);
  });
});

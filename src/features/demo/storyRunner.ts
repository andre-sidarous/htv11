/**
 * Runs Demo Control's automated story: steps in order, each after its delay, reporting progress
 * (with a countdown) and stopping cleanly when cancelled. Pure (timers injected), so it's tested.
 */

export type StoryStep = {
  id: string;
  /** Presenter-facing title, e.g. "Huddle checks in". */
  title: string;
  /** One line of narration the presenter can read out. */
  narration: string;
  /** Pause before this step starts. */
  delayMs: number;
  run: () => Promise<void>;
};

export type StepStatus = "pending" | "waiting" | "running" | "done" | "failed" | "skipped";

export type StoryProgress = {
  statuses: StepStatus[];
  /** Index of the step being waited on or run; -1 before start. */
  current: number;
  /** When the current step starts (for the countdown), if it's waiting. */
  startsAt: number | null;
  error: string | null;
  finished: boolean;
};

export type StoryOptions = {
  onProgress: (p: StoryProgress) => void;
  isCancelled: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Keep going after a failed step (marked "failed") instead of stopping. */
  continueOnError?: boolean;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sleep in small slices so a cancel is noticed quickly. */
async function wait(ms: number, sleep: (ms: number) => Promise<void>, isCancelled: () => boolean) {
  let left = ms;
  while (left > 0 && !isCancelled()) {
    const slice = Math.min(250, left);
    await sleep(slice);
    left -= slice;
  }
}

export async function runStory(steps: StoryStep[], options: StoryOptions): Promise<StoryProgress> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const progress: StoryProgress = { statuses: steps.map(() => "pending"), current: -1, startsAt: null, error: null, finished: false };
  const emit = () => options.onProgress({ ...progress, statuses: [...progress.statuses] });

  for (let i = 0; i < steps.length; i++) {
    if (options.isCancelled()) break;
    const step = steps[i]!;
    progress.current = i;
    progress.statuses[i] = "waiting";
    progress.startsAt = now() + step.delayMs;
    emit();
    await wait(step.delayMs, sleep, options.isCancelled);
    if (options.isCancelled()) break;

    progress.statuses[i] = "running";
    progress.startsAt = null;
    emit();
    try {
      await step.run();
      progress.statuses[i] = "done";
    } catch (e) {
      progress.statuses[i] = "failed";
      progress.error = `${step.title}: ${e instanceof Error ? e.message : "failed"}`;
      emit();
      if (!options.continueOnError) break;
    }
    emit();
  }

  progress.statuses = progress.statuses.map((s) => (s === "pending" || s === "waiting" ? "skipped" : s));
  progress.startsAt = null;
  progress.finished = true;
  emit();
  return progress;
}

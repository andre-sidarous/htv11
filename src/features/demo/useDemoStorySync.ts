import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import { demoFlags } from "./demoFlags";

/** Every phone in the Jam follows Demo Control's story switches (and drops them on "Reset demo"). */
export function useDemoStorySync(jamId: string | undefined) {
  const channel = useJamChannel(jamId);
  useJamEvent(channel, "demo_story", (e) => {
    if (e.jamId === jamId) demoFlags.set({ storyRunning: e.running, inAppCall: e.running && e.inAppCall });
  });
  useJamEvent(channel, "demo_reset", (e) => {
    if (e.jamId === jamId) demoFlags.reset();
  });
}

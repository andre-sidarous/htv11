import { SUPPORT_CALL_SCRIPT } from "@/lib/constants";
import type { AiService } from "@/lib/types";

/** Scripted support call. This is also the required fallback when Gemini fails. */
export const scriptedAiService: AiService = {
  async getSupportCallTurn(_context, step) {
    const index = Math.max(0, Math.min(step, SUPPORT_CALL_SCRIPT.length - 1));
    return { text: SUPPORT_CALL_SCRIPT[index]!, source: "scripted", step: index };
  },
};

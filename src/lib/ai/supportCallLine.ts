import { SUPPORT_CALL_SCRIPT } from "@/lib/constants";
import type { AiCallContext } from "@/lib/types";

/**
 * The scripted support-call line for a step, plus P3's directions and support-area note so the
 * call still helps them navigate when Gemini is off or slow. KEEP IN SYNC with
 * supabase/functions/_shared/supportCallLine.ts.
 */
export function scriptedSupportLine(context: Pick<AiCallContext, "guidance" | "supportNote"> | null, step: number): string {
  const index = Math.max(0, Math.min(Math.floor(step), SUPPORT_CALL_SCRIPT.length - 1));
  const parts: string[] = [SUPPORT_CALL_SCRIPT[index]!];
  // The last line says contacts may be notified; no directions after that.
  if (index < SUPPORT_CALL_SCRIPT.length - 1) {
    if (index === 0 && context?.supportNote) parts.push(context.supportNote);
    if (context?.guidance) parts.push(`If you can, ${lowerFirst(context.guidance)}`);
  }
  return parts.join(" ");
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

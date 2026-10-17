// The scripted support-call line plus P3's directions and support-area note.
// KEEP IN SYNC with src/lib/ai/supportCallLine.ts.
import { SUPPORT_CALL_SCRIPT } from "./constants.ts";

export type GuidanceContext = { guidance?: string; supportNote?: string };

export function scriptedSupportLine(context: GuidanceContext | null, step: number): string {
  const index = Math.max(0, Math.min(Math.floor(step), SUPPORT_CALL_SCRIPT.length - 1));
  const parts: string[] = [SUPPORT_CALL_SCRIPT[index]];
  // The last line says contacts may be notified; no directions after that.
  if (index < SUPPORT_CALL_SCRIPT.length - 1) {
    if (index === 0 && context?.supportNote) parts.push(context.supportNote);
    if (context?.guidance) parts.push(`If you can, ${lowerFirst(context.guidance)}`);
  }
  return parts.join(" ");
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

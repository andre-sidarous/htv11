import { mockServicesEnabled } from "@/lib/env";
import { getSupportCallTurn } from "@/lib/supabase/functions";
import type { AiService } from "@/lib/types";
import { scriptedAiService } from "./mock";

/** Calls the ai-support-call Edge Function, which falls back to the script; the client falls back too. */
const edgeAiService: AiService = { getSupportCallTurn };

// P4: the Gemini call lives in supabase/functions/ai-support-call. Speak turns with expo-speech.
export const aiService: AiService = mockServicesEnabled ? scriptedAiService : edgeAiService;

import { mockServicesEnabled } from "@/lib/env";
import type { RealtimeService } from "@/lib/types";
import { memoryRealtimeService } from "./memory";
import { supabaseRealtimeService } from "./supabase";

export const realtimeService: RealtimeService = mockServicesEnabled ? memoryRealtimeService : supabaseRealtimeService;

import type { IncidentService } from "@/lib/types";
import { mockIncidentService } from "./mock";

// P4: swap for the Supabase-backed implementation.
export const incidentService: IncidentService = mockIncidentService;

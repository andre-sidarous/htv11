import { mockServicesEnabled } from "@/lib/env";
import type { IncidentService } from "@/lib/types";
import { mockIncidentService } from "./mock";
import { supabaseIncidentService } from "./supabase";

export const incidentService: IncidentService = mockServicesEnabled ? mockIncidentService : supabaseIncidentService;

import type { LocationService } from "@/lib/types";
import { deviceLocationService } from "./device";

// Real expo-location GPS; the mock (./mock.ts) stays as the per-user simulated source for Demo Mode.
export const locationService: LocationService = deviceLocationService;

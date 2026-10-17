import type { LocationService } from "@/lib/types";
import { mockLocationService } from "./mock";

// P3: swap for the browser Geolocation implementation (keeping the simulated override).
export const locationService: LocationService = mockLocationService;

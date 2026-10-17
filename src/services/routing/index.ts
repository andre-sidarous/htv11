import type { RoutingService } from "@/lib/types";
import { osrmRoutingService } from "./osrm";

// OSRM (EXPO_PUBLIC_OSRM_URL), falling back to mockRoutingService's Campus Walk route.
export const routingService: RoutingService = osrmRoutingService;

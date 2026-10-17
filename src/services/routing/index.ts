import type { RoutingService } from "@/lib/types";
import { mockRoutingService } from "./mock";

// P3: swap for OSRM (NEXT_PUBLIC_OSRM_URL) with mockRoutingService as the fallback.
export const routingService: RoutingService = mockRoutingService;

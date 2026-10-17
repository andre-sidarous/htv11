import { mockServicesEnabled } from "@/lib/env";
import type { NotificationService } from "@/lib/types";
import { mockNotificationService } from "./mock";
import { supabaseNotificationService } from "./supabase";

export const notificationService: NotificationService = mockServicesEnabled ? mockNotificationService : supabaseNotificationService;

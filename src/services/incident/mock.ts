import { randomUUID } from "expo-crypto";
import { DEFAULT_INCIDENT_RETENTION_HOURS } from "@/lib/constants";
import type { IncidentPackage, IncidentService } from "@/lib/types";

/** In-memory incidents (lost on reload). P4 implements Supabase persistence. */
const store = new Map<string, IncidentPackage>();

export const mockIncidentService: IncidentService = {
  async createPackage(input) {
    const now = new Date();
    const retentionHours = input.retentionHours || DEFAULT_INCIDENT_RETENTION_HOURS;
    const incident: IncidentPackage = {
      ...input,
      id: randomUUID(),
      retentionHours,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + retentionHours * 3_600_000).toISOString(),
      deletedAt: null,
    };
    store.set(incident.id, incident);
    return { incident, accessToken: randomUUID() };
  },
  async getPackage(id) {
    const incident = store.get(id);
    return incident && !incident.deletedAt ? incident : null;
  },
  async deletePackage(id) {
    const incident = store.get(id);
    if (incident) store.set(id, { ...incident, deletedAt: new Date().toISOString(), recordingUrl: null });
  },
};

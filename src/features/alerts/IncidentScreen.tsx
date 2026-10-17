import { Placeholder } from "@/components/Placeholder";

/**
 * OWNER: P5. Incident package screen. `token` is an external-contact access token (validated by the
 * incident-access Edge Function) or an incident id for Jam members. Replace the body; keep the export.
 */
export function IncidentScreen({ token: _token }: { token: string }) {
  return <Placeholder title="Incident package" owner="P5" />;
}

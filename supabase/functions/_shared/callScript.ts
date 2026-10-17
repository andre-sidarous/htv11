// Pure helpers for the trusted-contact phone call (no network, no Deno APIs) so they're unit-testable.

export type CallScriptInput = {
  contactName: string;
  personName: string;
  /** Only when the contact may receive location. e.g. "near Robarts Library, St. George Street" */
  placeDescription?: string | null;
  /** Only when the contact may receive the health/activity summary. Human-readable alert reasons. */
  reasons?: string[] | null;
  /** True when a text with details follows the call. */
  textFollows?: boolean;
};

/** What the contact hears. Never includes recordings, phone numbers, or anything they weren't allowed. */
export function buildCallMessage({ contactName, personName, placeDescription, reasons, textFollows }: CallScriptInput): string {
  const parts = [
    `Hello ${contactName}. This is an automated call from Jam, a group travel safety app.`,
    `${personName} listed you as a trusted contact. ${personName} may need support. They stopped responding to their group and to Jam's support call.`,
  ];
  if (placeDescription) parts.push(`Their last known location was ${placeDescription}.`);
  const shown = (reasons ?? []).filter(Boolean).slice(0, 2);
  if (shown.length) parts.push(`Jam noticed: ${shown.map((r) => r.replace(/\.$/, "")).join(", and ")}.`);
  if (textFollows) parts.push("We are also sending you a text message with the details.");
  parts.push(
    `Please try to reach ${personName} directly.`,
    "If you believe they are in immediate danger, call 9 1 1.",
    "Jam is not an emergency service.",
  );
  return parts.join(" ");
}

export type SmsInput = {
  personName: string;
  /** Only when the contact may receive location. */
  location?: { latitude: number; longitude: number; placeDescription?: string | null; minutesAgo?: number | null } | null;
  /** Only when the contact may receive the health/activity summary. */
  reasons?: string[] | null;
  /** Only when the contact may receive the recording and one exists. Short-lived signed URL. */
  recordingUrl?: string | null;
};

/** The follow-up text. Same rules as the call: only what this contact is allowed to receive. */
export function buildSmsMessage({ personName, location, reasons, recordingUrl }: SmsInput): string {
  const lines = [`Jam alert: ${personName} may need support. They stopped responding to their group and to Jam's support call.`];
  if (location) {
    const where = location.placeDescription ? `Last seen ${location.placeDescription}` : "Last seen location";
    const when = location.minutesAgo != null ? ` (${location.minutesAgo < 1 ? "just now" : `${location.minutesAgo} min ago`})` : "";
    lines.push(`${where}${when}: ${mapsLink(location.latitude, location.longitude)}`);
  }
  const shown = (reasons ?? []).filter(Boolean).slice(0, 3);
  if (shown.length) lines.push(`Jam noticed: ${shown.map((r) => r.replace(/\.$/, "")).join("; ")}.`);
  if (recordingUrl) lines.push(`Support call recording (link expires in 24 hours): ${recordingUrl}`);
  lines.push(`Try to reach ${personName}. If they are in immediate danger, call 911. Jam is not an emergency service.`);
  return lines.join("\n");
}

export const mapsLink = (latitude: number, longitude: number) =>
  `https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;

const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);

/** TwiML that reads the message twice, so a contact who picks up late still hears it. */
export function buildTwiml(message: string): string {
  const say = `<Say voice="Polly.Joanna" language="en-US">${escapeXml(message)}</Say>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Pause length="1"/>${say}</Response>`;
}

/** E.164 (+ country code, 8 to 15 digits). Twilio rejects anything else. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

/** "near Robarts Library, St. George Street" from a Nominatim reverse-geocode response. */
export function describePlace(nominatim: {
  name?: string;
  address?: Record<string, string | undefined>;
} | null): string | null {
  if (!nominatim) return null;
  const a = nominatim.address ?? {};
  const landmark = nominatim.name || a.amenity || a.building || a.tourism || a.shop;
  const street = a.road || a.pedestrian || a.footway;
  const area = a.neighbourhood || a.suburb || a.city_district;
  if (landmark && street && landmark !== street) return `near ${landmark}, ${street}`;
  if (landmark) return `near ${landmark}`;
  if (street && area) return `on ${street}, ${area}`;
  if (street) return `on ${street}`;
  if (area) return `in ${area}`;
  return null;
}

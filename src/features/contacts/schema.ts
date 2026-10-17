import { z } from "zod";
import type { ConfirmationStatus, TrustedContactRow } from "@/lib/types";

/**
 * Trusted-contact form validation. Pure (no react-native imports) so it's unit-tested.
 * Empty optional fields become null; at least one way to reach the contact is required.
 */

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

/** Stored as E.164 (+ country code, digits only) because Twilio calls need it. */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, "");
  // North American numbers typed without the "+": "1 416 555 0123" or "416 555 0123".
  if (/^1[2-9]\d{9}$/.test(compact)) return `+${compact}`;
  if (/^[2-9]\d{9}$/.test(compact)) return `+1${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

export const contactFormSchema = z
  .object({
    name: z.string().trim().min(1, "Add a name.").max(80, "Keep the name under 80 characters."),
    relationship: optionalText(40, "Keep this under 40 characters."),
    phone_number: z
      .string()
      .trim()
      .refine((v) => v === "" || normalizePhone(v) !== null, "Include the country code, e.g. +1 416 555 0123.")
      .transform((v) => (v === "" ? null : normalizePhone(v))),
    email: z
      .string()
      .trim()
      .refine((v) => v === "" || z.email().safeParse(v).success, "That email doesn't look right.")
      .transform((v) => (v === "" ? null : v.toLowerCase())),
    receive_location: z.boolean(),
    receive_health_summary: z.boolean(),
    receive_recording: z.boolean(),
    confirmation_status: z.enum(["pending", "confirmed", "declined"]),
  })
  .refine((v) => v.phone_number !== null || v.email !== null, {
    message: "Add a phone number so Jam can call them (or at least an email).",
    path: ["phone_number"],
  });

export type ContactFormValues = z.input<typeof contactFormSchema>;
export type ContactInput = z.output<typeof contactFormSchema>;
export type ContactFieldErrors = Partial<Record<keyof ContactFormValues, string>>;

/** New contacts share nothing until the owner turns it on. */
export const emptyContactForm: ContactFormValues = {
  name: "",
  relationship: "",
  phone_number: "",
  email: "",
  receive_location: false,
  receive_health_summary: false,
  receive_recording: false,
  confirmation_status: "pending",
};

export function toFormValues(row: TrustedContactRow): ContactFormValues {
  return {
    name: row.name,
    relationship: row.relationship ?? "",
    phone_number: row.phone_number ?? "",
    email: row.email ?? "",
    receive_location: row.receive_location,
    receive_health_summary: row.receive_health_summary,
    receive_recording: row.receive_recording,
    confirmation_status: row.confirmation_status,
  };
}

export function validateContact(
  values: ContactFormValues,
): { ok: true; data: ContactInput } | { ok: false; errors: ContactFieldErrors } {
  const result = contactFormSchema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const errors: ContactFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof ContactFormValues | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

/** Plain-language summary of what a contact may receive. */
export function describeSharing(contact: Pick<TrustedContactRow, "receive_location" | "receive_health_summary" | "receive_recording">): string {
  const parts = [
    contact.receive_location && "location",
    contact.receive_health_summary && "health summary",
    contact.receive_recording && "recording",
  ].filter(Boolean) as string[];
  if (parts.length === 0) return "Nothing is shared with them yet.";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `If Jam can't reach you, they can see your ${list}.`;
}

export const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = {
  pending: "Waiting to confirm",
  confirmed: "Confirmed",
  declined: "Declined",
};

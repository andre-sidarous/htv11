import type { NotificationService } from "@/lib/types";

/** In-app only; ntfy reported as skipped. P5 implements the real service (calling the notify-ntfy Edge Function). */
export const mockNotificationService: NotificationService = {
  async notifyGroup() {
    return [
      { channel: "in_app", status: "sent" },
      { channel: "ntfy", status: "skipped", detail: "Mock notification service" },
    ];
  },
  async notifyContacts() {
    return [{ channel: "voice_call", status: "skipped", detail: "Mock notification service" }];
  },
  async previewSms({ contactIds }) {
    return contactIds.map((contactId) => ({
      contactId,
      to: "(preview only)",
      body: "Jam: someone who listed you as a trusted contact may need support. Open the link to view details.",
    }));
  },
  async getStatus() {
    return { ntfyConfigured: false, lastNotification: null };
  },
};

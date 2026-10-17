/** Seeded demo accounts (supabase/seed.sql). Shared by the Welcome screen's one-tap sign-in
 * and the Demo Mode role picker (the "Load seeded Campus Walk" backup path). */
export const DEMO_ACCOUNT_PASSWORD = "jam-demo-1234";

export type DevAccountRole = "host" | "group_member" | "affected_user" | "emergency_contact";

export type DevAccount = {
  role: DevAccountRole;
  email: string;
  label: string;
  description: string;
};

export const DEV_ACCOUNTS: DevAccount[] = [
  { role: "host", email: "host@jam.demo", label: "Host", description: "Created the Jam and starts it." },
  { role: "group_member", email: "member@jam.demo", label: "Group member", description: "Travels with the group." },
  {
    role: "affected_user",
    email: "affected@jam.demo",
    label: "Affected user",
    description: "The member the demo focuses on.",
  },
  {
    role: "emergency_contact",
    email: "contact@jam.demo",
    label: "Emergency contact",
    description: "Receives the incident package.",
  },
];

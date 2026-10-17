import { useEffect, useState } from "react";
import { getDemoContext, subscribeDemoContext } from "@/features/demo/demoContext";
import { mockServicesEnabled } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * The signed-in user's id. In mock mode (one device, no auth) this phone plays the demo's
 * affected user, so the whole flow can be walked through on a single phone.
 */
export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(() => (mockServicesEnabled ? getDemoContext().affectedUserId : null));

  useEffect(() => {
    if (mockServicesEnabled) {
      return subscribeDemoContext((context) => setUserId(context.affectedUserId));
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return userId;
}

/** Same, outside React (demo actions). */
export async function getCurrentUserId(): Promise<string | null> {
  if (mockServicesEnabled) return getDemoContext().affectedUserId;
  const { data } = (await getSupabaseClient()?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.user.id ?? null;
}

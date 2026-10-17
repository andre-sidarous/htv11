import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/types";
import {
  DEFAULT_ONBOARDING_DRAFT,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from "./onboardingDraft";

/**
 * App-wide session state: the Supabase auth session, the current user's `profiles` row
 * (there's no DB trigger, so this is null until profile setup runs), and the on-device
 * onboarding draft (consent + baseline defaults). The root layout uses this to gate routes.
 */
type SessionState = {
  loading: boolean;
  session: Session | null;
  profile: ProfileRow | null;
  onboardingDraft: OnboardingDraft;
  onboardingComplete: boolean;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: ProfileRow) => void;
  setOnboardingDraft: (draft: OnboardingDraft) => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfileState] = useState<ProfileRow | null>(null);
  const [onboardingDraft, setOnboardingDraftState] = useState<OnboardingDraft>(DEFAULT_ONBOARDING_DRAFT);

  async function loadProfileFor(userId: string | undefined) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) {
      setProfileState(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfileState(data ?? null);
  }

  useEffect(() => {
    let active = true;

    void loadOnboardingDraft().then((draft) => {
      if (active) setOnboardingDraftState(draft);
    });

    const supabase = getSupabaseClient();
    if (!supabase) {
      // No Supabase configured: there's no async session check to wait for, so resolve now.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfileFor(data.session?.user.id);
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      void loadProfileFor(newSession?.user.id).then(() => {
        if (active) setLoading(false);
      });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      loading,
      session,
      profile,
      onboardingDraft,
      onboardingComplete: onboardingDraft.completedAt !== null,
      refreshProfile: () => loadProfileFor(session?.user.id),
      setProfile: setProfileState,
      setOnboardingDraft: async (draft: OnboardingDraft) => {
        setOnboardingDraftState(draft);
        await saveOnboardingDraft(draft);
      },
    }),
    [loading, session, profile, onboardingDraft],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>.");
  return ctx;
}

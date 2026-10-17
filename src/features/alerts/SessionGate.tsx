import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { sendEmailCode, verifyEmailCode } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fonts, colors, radius, space, TAP_TARGET, type } from "@/theme";

/**
 * Renders children only for a signed-in user with a profile. Used by P5's screens.
 *
 * TEMPORARY: until P2's welcome / sign-in / profile screens merge, this offers a minimal real
 * sign-in (email + 6-digit code) and a display-name step. After P2 merges, the root layout keeps
 * signed-out users away from these screens, so this fallback simply never shows.
 */

type Status = "loading" | "signedOut" | "needsProfile" | "ready" | "unconfigured";

export function SessionGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (getSupabaseClient() ? "loading" : "unconfigured"));

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;

    async function resolve(userId: string | undefined) {
      if (!userId) return setStatus("signedOut");
      const { data } = await supabase!.from("profiles").select("id").eq("id", userId).maybeSingle();
      if (!cancelled) setStatus(data ? "ready" : "needsProfile");
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session?.user.id));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => void resolve(session?.user.id));
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  if (status === "ready") return <>{children}</>;
  if (status === "loading") return <LoadingState />;
  if (status === "unconfigured") {
    return (
      <View style={styles.screen}>
        <EmptyState title="Huddle isn't connected yet" description="Add the Supabase values to .env and restart the app." />
      </View>
    );
  }
  if (status === "needsProfile") return <ProfileStep onDone={() => setStatus("ready")} />;
  return <EmailSignIn />;
}

function EmailSignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendCode() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMessage("Enter the email you signed up with.");
    setBusy(true);
    setMessage(null);
    const { error } = await sendEmailCode(email);
    setBusy(false);
    if (error) return setMessage(/rate|limit/i.test(error) ? "Too many codes sent. Please wait a few minutes." : "Couldn't send a code. Try again.");
    setStep("code");
  }

  async function verify() {
    setBusy(true);
    setMessage(null);
    const { error } = await verifyEmailCode(email, code);
    setBusy(false);
    if (error) setMessage("That code didn't work. Check the latest email and try again.");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <Text style={type.title}>Sign in to Huddle</Text>
      {step === "email" ? (
        <>
          <Text style={[type.body, styles.muted]}>We’ll email you a 6-digit code. New here? This creates your account.</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            style={styles.input}
          />
          <PrimaryButton label="Send code" busy={busy} onPress={sendCode} />
        </>
      ) : (
        <>
          <Text style={[type.body, styles.muted]}>Enter the code we sent to {email.trim()}.</Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            accessibilityLabel="6-digit code"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            style={[styles.input, styles.code]}
          />
          <PrimaryButton label="Sign in" busy={busy} disabled={code.length !== 6} onPress={verify} />
          <Pressable accessibilityRole="button" onPress={() => setStep("email")} style={styles.link}>
            <Text style={styles.linkText}>Use a different email</Text>
          </Pressable>
        </>
      )}
      {message ? <Text style={[type.caption, styles.error]}>{message}</Text> : null}
    </KeyboardAvoidingView>
  );
}

function ProfileStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const supabase = getSupabaseClient();
    const trimmed = name.trim();
    if (!supabase || !trimmed) return setMessage("Add the name your Huddle will see.");
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = auth.user
      ? await supabase.from("profiles").insert({ id: auth.user.id, display_name: trimmed })
      : { error: { message: "signed out" } };
    setBusy(false);
    if (error) return setMessage("Couldn't save your name. Try again.");
    onDone();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <Text style={type.title}>Let’s set up your Huddle profile</Text>
      <Text style={[type.body, styles.muted]}>You can change this later.</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        accessibilityLabel="Display name"
        autoComplete="name"
        textContentType="name"
        maxLength={60}
        style={styles.input}
      />
      <PrimaryButton label="Continue" busy={busy} onPress={save} />
      {message ? <Text style={[type.caption, styles.error]}>{message}</Text> : null}
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({ label, busy, disabled, onPress }: { label: string; busy: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dim]}
    >
      {busy ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", gap: space(3), padding: space(6), backgroundColor: colors.warmWhite },
  muted: { color: colors.inkMuted, marginBottom: space(1) },
  input: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space(4),
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.ink,
  },
  code: { fontSize: 24, letterSpacing: 8, textAlign: "center" },
  button: {
    minHeight: TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  dim: { opacity: 0.6 },
  buttonText: { color: colors.warmWhite, fontSize: 16, fontFamily: fonts.semibold, fontWeight: "600" },
  link: { alignSelf: "center", minHeight: TAP_TARGET, justifyContent: "center" },
  linkText: { color: colors.navy, fontSize: 15, fontFamily: fonts.semibold, fontWeight: "600", textDecorationLine: "underline" },
  error: { color: colors.escalation },
});

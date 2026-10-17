import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { HuddleLogo, Pico } from "@/components/brand";
import { Button, Card, Screen, TextField } from "@/components/ui";
import { publicEnv } from "@/lib/env";
import { sendEmailCode, signInWithDevAccount, signInWithGoogle, verifyEmailCode } from "@/lib/supabase/auth";
import { colors, space, type } from "@/theme";
import { DEMO_ACCOUNT_PASSWORD, DEV_ACCOUNTS } from "./devAccounts";

type Step = "email" | "code";

/**
 * Sign in / sign up. A successful sign-in updates the Supabase session; `SessionProvider`
 * picks that up via `onAuthStateChange` and the root layout routes onward automatically.
 */
export function WelcomeScreen() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email to continue.");
      return;
    }
    setLoading("send");
    setError(null);
    const { error } = await sendEmailCode(trimmed);
    setLoading(null);
    if (error) setError(error);
    else setStep("code");
  }

  async function handleVerifyCode() {
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setLoading("verify");
    setError(null);
    const { error } = await verifyEmailCode(email, code);
    setLoading(null);
    if (error) setError(error);
  }

  async function handleDevLogin(devEmail: string) {
    setLoading(devEmail);
    setError(null);
    const { error } = await signInWithDevAccount(devEmail, DEMO_ACCOUNT_PASSWORD);
    setLoading(null);
    if (error) setError(error);
  }

  async function handleGoogle() {
    setLoading("google");
    setError(null);
    const { error } = await signInWithGoogle();
    setLoading(null);
    if (error) setError(error);
  }

  return (
    <Screen scroll>
      <View style={[styles.hero, styles.brandHero]}>
        <Pico mood="wave" size={150} />
        <HuddleLogo size={44} tagline />
        <Text style={[type.bodyMuted, styles.centerText]} maxFontSizeMultiplier={1.6}>
          Travel together. Huddle quietly looks out for your group.
        </Text>
      </View>

      <Card>
        {step === "email" ? (
          <>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              placeholder="you@school.edu"
              editable={loading === null}
            />
            {error ? <ErrorText text={error} /> : null}
            <Button label="Continue with email" onPress={handleSendCode} loading={loading === "send"} />
          </>
        ) : (
          <>
            <Text style={type.caption} maxFontSizeMultiplier={1.8}>
              We sent a 6-digit code to {email.trim()}.
            </Text>
            <TextField
              label="6-digit code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              editable={loading === null}
            />
            {error ? <ErrorText text={error} /> : null}
            <Button label="Verify code" onPress={handleVerifyCode} loading={loading === "verify"} />
            <Button
              label="Use a different email"
              variant="ghost"
              onPress={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              disabled={loading !== null}
            />
          </>
        )}
      </Card>

      {publicEnv.enableDevLogin ? (
        <Card>
          <Text style={type.heading}>Demo accounts</Text>
          <Text style={type.caption}>For the hackathon demo — one tap, no email needed.</Text>
          <View style={styles.devList}>
            {DEV_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                label={account.label}
                variant="secondary"
                onPress={() => handleDevLogin(account.email)}
                loading={loading === account.email}
                disabled={loading !== null && loading !== account.email}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Button label="Continue with Google" variant="ghost" onPress={handleGoogle} loading={loading === "google"} />
    </Screen>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <Text accessibilityRole="alert" style={styles.errorText} maxFontSizeMultiplier={1.8}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space(2), marginBottom: space(2) },
  brandHero: { alignItems: "center", paddingTop: space(4) },
  centerText: { textAlign: "center" },
  devList: { gap: space(2) },
  errorText: { color: colors.escalation, fontSize: 14 },
});

import { useEffect, type ReactNode } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LoadingState } from "@/components/ui/States";
import { SessionProvider, useSession } from "@/features/auth/SessionProvider";
import { colors } from "@/theme";

/**
 * Routes based on auth state: no session -> (auth)/welcome, session but no `profiles` row ->
 * (auth)/profile, profile but onboarding (consent + baseline) not done -> (auth)/consent,
 * otherwise out of the (auth) group entirely. Runs on every session/segment change.
 */
function SessionGate({ children }: { children: ReactNode }) {
  const { loading, session, profile, onboardingComplete } = useSession();
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    const authScreen = segments[1];

    if (!session) {
      if (!inAuthGroup || authScreen !== "welcome") router.replace("/(auth)/welcome");
      return;
    }
    if (!profile) {
      if (!inAuthGroup || authScreen !== "profile") router.replace("/(auth)/profile");
      return;
    }
    if (!onboardingComplete) {
      const onOnboardingScreen = inAuthGroup && (authScreen === "consent" || authScreen === "baseline");
      if (!onOnboardingScreen) router.replace("/(auth)/consent");
      return;
    }
    if (inAuthGroup) router.replace("/");
  }, [loading, session, profile, onboardingComplete, segments, router]);

  if (loading) return <LoadingState label="Loading Jam…" />;
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <SessionGate>
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.warmWhite },
              headerTintColor: colors.brand,
              headerTitleStyle: { color: colors.ink, fontWeight: "600" },
              contentStyle: { backgroundColor: colors.warmWhite },
            }}
          >
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            {/* Header-less screens still need a title: iOS uses it as the NEXT screen's back label,
                and without one it shows the raw route name (e.g. "jam/[jamId]/(tabs)"). */}
            <Stack.Screen name="index" options={{ headerShown: false, title: "Home" }} />
            <Stack.Screen name="create" options={{ title: "Create a Jam", presentation: "modal" }} />
            <Stack.Screen name="solo" options={{ title: "Solo Jam", presentation: "modal" }} />
            <Stack.Screen name="join" options={{ title: "Join a Jam", presentation: "modal" }} />
            <Stack.Screen name="join/[code]" options={{ title: "Join a Jam" }} />
            <Stack.Screen name="demo" options={{ title: "Demo Mode", presentation: "modal" }} />
            <Stack.Screen name="privacy" options={{ title: "Privacy defaults", presentation: "modal" }} />
            <Stack.Screen name="jam/[jamId]/lobby" options={{ title: "Jam lobby" }} />
            <Stack.Screen name="jam/[jamId]/chat" options={{ title: "Chat" }} />
            <Stack.Screen name="jam/[jamId]/(tabs)" options={{ headerShown: false, title: "Jam" }} />
            <Stack.Screen name="dev" options={{ title: "Developer check" }} />
          </Stack>
        </SessionGate>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

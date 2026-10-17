// Per-weight subpaths: importing the package root would bundle all 18 Inter files (~6 MB).
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Caveat_600SemiBold } from "@expo-google-fonts/caveat/600SemiBold";
import { useFonts } from "expo-font";
import { useEffect, type ReactNode } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LoadingState } from "@/components/ui/States";
import { SessionProvider, useSession } from "@/features/auth/SessionProvider";
import { APP_NAME } from "@/lib/constants";
import { colors, fonts } from "@/theme";

// Keep Pico's splash up until Inter has loaded, so text never flashes in the system font.
void SplashScreen.preventAutoHideAsync().catch(() => {});

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

  if (loading) return <LoadingState label={`Loading ${APP_NAME}…`} />;
  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Caveat_600SemiBold });
  // On a font error, carry on with the system font rather than blocking the app.
  const ready = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

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
              headerTitleStyle: { color: colors.ink, fontFamily: fonts.semibold, fontWeight: "600" },
              contentStyle: { backgroundColor: colors.warmWhite },
            }}
          >
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            {/* Header-less screens still need a title: iOS uses it as the NEXT screen's back label,
                and without one it shows the raw route name (e.g. "jam/[jamId]/(tabs)"). */}
            <Stack.Screen name="index" options={{ headerShown: false, title: "Home" }} />
            <Stack.Screen name="create" options={{ title: "Create a Huddle", presentation: "modal" }} />
            <Stack.Screen name="solo" options={{ title: "Solo Huddle", presentation: "modal" }} />
            <Stack.Screen name="join" options={{ title: "Join a Huddle", presentation: "modal" }} />
            <Stack.Screen name="join/[code]" options={{ title: "Join a Huddle" }} />
            <Stack.Screen name="demo" options={{ title: "Demo Mode", presentation: "modal" }} />
            <Stack.Screen name="privacy" options={{ title: "Privacy defaults", presentation: "modal" }} />
            <Stack.Screen name="jam/[jamId]/lobby" options={{ title: "Huddle lobby" }} />
            <Stack.Screen name="jam/[jamId]/chat" options={{ title: "Chat" }} />
            <Stack.Screen name="jam/[jamId]/(tabs)" options={{ headerShown: false, title: "Huddle" }} />
            <Stack.Screen name="dev" options={{ title: "Developer check" }} />
          </Stack>
        </SessionGate>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

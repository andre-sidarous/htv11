import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/theme";

/**
 * Root navigator. P2 owns the route structure below this; suggested layout:
 *   (auth)/welcome, (auth)/profile, (auth)/consent, (auth)/baseline
 *   index (home), create, join, join/[code], demo
 *   jam/[jamId]/lobby
 *   jam/[jamId]/(tabs)/map | group | signals | settings
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.warmWhite },
          headerTintColor: colors.navy,
          contentStyle: { backgroundColor: colors.warmWhite },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="dev" options={{ title: "Developer check" }} />
      </Stack>
    </SafeAreaProvider>
  );
}

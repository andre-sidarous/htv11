import { Stack } from "expo-router";

/** Onboarding stack: welcome -> profile -> consent -> health -> baseline. No headers; each screen is full-bleed. */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="health" />
      <Stack.Screen name="baseline" />
    </Stack>
  );
}

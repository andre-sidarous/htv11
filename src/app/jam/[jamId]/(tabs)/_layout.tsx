import { useKeepAwake } from "expo-keep-awake";
import { Tabs, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { JamOverlayHost } from "@/components/JamOverlayHost";
import { colors } from "@/theme";

/**
 * Active-Jam shell: bottom tabs (Map / Group / Signals / Settings) plus the overlay host for
 * P4's check-in and P5's alert cards, mounted once above the tabs so neither owner needs to
 * touch this file. Keeps the screen awake for the whole time a Jam is active.
 */
export default function JamTabsLayout() {
  const { jamId } = useLocalSearchParams<{ jamId: string }>();
  useKeepAwake();

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.warmWhite },
          headerShadowVisible: false,
          headerTintColor: colors.navy,
          tabBarActiveTintColor: colors.navy,
          tabBarInactiveTintColor: colors.inkFaint,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        }}
      >
        <Tabs.Screen name="map" options={{ title: "Map", tabBarAccessibilityLabel: "Map" }} />
        <Tabs.Screen name="group" options={{ title: "Group", tabBarAccessibilityLabel: "Group" }} />
        <Tabs.Screen name="signals" options={{ title: "Signals", tabBarAccessibilityLabel: "Signals" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings", tabBarAccessibilityLabel: "Settings" }} />
      </Tabs>
      <JamOverlayHost jamId={jamId} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });

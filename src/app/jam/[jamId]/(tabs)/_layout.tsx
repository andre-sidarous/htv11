import { useKeepAwake } from "expo-keep-awake";
import { Tabs, useLocalSearchParams } from "expo-router";
import { Activity, Map as MapIcon, Settings, Users, type LucideIcon } from "lucide-react-native";
import { StyleSheet, View, type ColorValue } from "react-native";
import { HuddleLogo } from "@/components/brand";
import { JamOverlayHost } from "@/components/JamOverlayHost";
import { ChatBanner } from "@/features/jams/ChatBanner";
import { useChatUnread } from "@/features/jams/chatUnread";
import { JamIdProvider } from "@/features/jams/JamIdContext";
import { fonts, colors } from "@/theme";

/** Every Huddle tab shows the wordmark in its header; the tab bar (and each screen's title) names the tab. */
function HeaderLogo() {
  return <HuddleLogo variant="wordmark" height={28} />;
}

function tabIcon(Glyph: LucideIcon) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Glyph size={22} color={String(color)} strokeWidth={focused ? 2.25 : 1.75} />;
  };
}

/**
 * Active-Jam shell: bottom tabs (Map / Group / Signals / Settings) plus the overlay host for
 * P4's check-in and P5's alert cards, mounted once above the tabs so neither owner needs to
 * touch this file. Keeps the screen awake for the whole time a Jam is active.
 */
export default function JamTabsLayout() {
  const { jamId } = useLocalSearchParams<{ jamId: string }>();
  useKeepAwake();
  const unreadChat = useChatUnread(jamId);

  return (
    <JamIdProvider jamId={jamId}>
      <View style={styles.container}>
        <Tabs
          screenOptions={{
            headerStyle: { backgroundColor: colors.warmWhite },
            headerShadowVisible: false,
            headerTitle: HeaderLogo,
            headerTitleAlign: "center",
            headerTintColor: colors.brand,
            headerTitleStyle: { color: colors.ink, fontFamily: fonts.semibold, fontWeight: "600" },
            tabBarActiveTintColor: colors.brand,
            tabBarInactiveTintColor: colors.inkFaint,
            tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
            tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: "600" },
          }}
        >
          <Tabs.Screen name="map" options={{ title: "Map", tabBarAccessibilityLabel: "Map", tabBarIcon: tabIcon(MapIcon) }} />
          <Tabs.Screen
            name="group"
            options={{
              title: "Group",
              tabBarAccessibilityLabel: unreadChat ? `Group, ${unreadChat} new chat messages` : "Group",
              tabBarIcon: tabIcon(Users),
              tabBarBadge: unreadChat ? (unreadChat > 9 ? "9+" : unreadChat) : undefined,
              tabBarBadgeStyle: { backgroundColor: colors.brand, color: colors.surface, fontSize: 11 },
            }}
          />
          <Tabs.Screen name="signals" options={{ title: "Health", tabBarAccessibilityLabel: "Health signals", tabBarIcon: tabIcon(Activity) }} />
          <Tabs.Screen name="settings" options={{ title: "Settings", tabBarAccessibilityLabel: "Settings", tabBarIcon: tabIcon(Settings) }} />
        </Tabs>
        <JamOverlayHost jamId={jamId} />
        <ChatBanner jamId={jamId} />
      </View>
    </JamIdProvider>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });

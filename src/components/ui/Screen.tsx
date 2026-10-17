import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { colors, space } from "@/theme";

/**
 * Safe-area aware screen shell. Use `scroll` for forms/long content; plain `View` for
 * screens that manage their own scrolling (e.g. a map or a list).
 */
export function Screen({
  children,
  scroll = false,
  edges = ["top", "bottom", "left", "right"],
  style,
  contentContainerStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  if (scroll) {
    return (
      <SafeAreaView style={[styles.screen, style]} edges={edges}>
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.screen, style]} edges={edges}>
      <View style={[styles.content, { flex: 1 }, contentContainerStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.warmWhite },
  content: { padding: space(5), gap: space(4), paddingBottom: space(10) },
});

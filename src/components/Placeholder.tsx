import { StyleSheet, View } from "react-native";
import { EmptyState } from "@/components/ui/States";
import { colors, space } from "@/theme";

/** Stand-in for a screen another teammate hasn't merged yet. */
export function Placeholder({ title, owner }: { title: string; owner: string }) {
  return (
    <View style={styles.screen}>
      <EmptyState title={title} description={`Coming soon (${owner}).`} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: space(6), backgroundColor: colors.warmWhite },
});

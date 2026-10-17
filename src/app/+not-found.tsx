import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { EmptyState } from "@/components/ui/States";
import { colors, space } from "@/theme";

export default function NotFoundScreen() {
  return (
    <View style={styles.screen}>
      <EmptyState
        title="We couldn't find that screen"
        description="The link may have expired or the Jam may have ended."
        action={
          <Link href="/">
            <Text style={styles.link}>Go home</Text>
          </Link>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: space(6), backgroundColor: colors.warmWhite },
  link: { color: colors.navy, fontSize: 16, fontWeight: "600", textDecorationLine: "underline" },
});

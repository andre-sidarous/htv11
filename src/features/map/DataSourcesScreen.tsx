import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, space, type } from "@/theme";
import { DATA_EXTRACTED_AT, DATA_SOURCES, SAFETY_DISCLAIMER } from "./dataSources";

/** Every dataset behind the map: who publishes it, how fresh it is, what it adds, and its limits. */
export function DataSourcesScreen() {
  const extracted = new Date(DATA_EXTRACTED_AT);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={type.title}>Where the map data comes from</Text>
        <Text style={type.body}>
          Jam bundles compact extracts of public data for the whole City of Toronto, so the map works without a connection.
          Data was extracted on {Number.isNaN(extracted.getTime()) ? "an earlier date" : extracted.toLocaleDateString()}.
        </Text>
        <View style={styles.disclaimer} accessibilityRole="text">
          <Text style={type.body}>{SAFETY_DISCLAIMER}</Text>
        </View>
        <Text style={type.caption}>Map data © OpenStreetMap / City of Toronto. Contains information licensed under the Open Government Licence – Toronto.</Text>
      </View>

      {DATA_SOURCES.map((source) => (
        <View key={source.name} style={styles.card}>
          <Text style={type.heading}>{source.name}</Text>
          <Field label="Publisher" value={source.publisher} />
          <Field label="Refresh" value={source.refresh} />
          <Field label="What it adds" value={source.contributes} />
          <Field label="Limitations" value={source.limitations} />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open ${source.name} dataset page`}
            onPress={() => void Linking.openURL(source.url).catch(() => undefined)}
            style={styles.link}
          >
            <Text style={styles.linkText} numberOfLines={1}>
              {source.url}
            </Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Text style={type.body}>
      <Text style={styles.label}>{label}: </Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.warmWhite },
  content: { gap: space(4), padding: space(4), paddingBottom: space(10) },
  intro: { gap: space(3) },
  disclaimer: { padding: space(4), borderRadius: radius.sm, backgroundColor: colors.amberSoft },
  card: { gap: space(2), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  label: { fontWeight: "600", color: colors.navy },
  link: { minHeight: 48, justifyContent: "center" },
  linkText: { color: colors.navySoft, textDecorationLine: "underline", fontSize: 14 },
});

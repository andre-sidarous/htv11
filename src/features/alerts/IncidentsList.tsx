import { Stack, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { colors, radius, shadow, space, type } from "@/theme";
import { listSharedIncidents, type IncidentSummary } from "./incidentApi";
import { formatAgo } from "./presentation";
import { SessionGate } from "./SessionGate";

const ROLE_LABEL: Record<IncidentSummary["role"], string> = {
  self: "About you",
  member: "From your Huddle",
  contact: "You're their trusted contact",
};

/** OWNER: P5. Incidents shared with me (route: /incidents). How an emergency contact finds the package. */
export function IncidentsList() {
  return (
    <>
      <Stack.Screen options={{ title: "Incidents" }} />
      <SessionGate>
        <List />
      </SessionGate>
    </>
  );
}

function List() {
  const [items, setItems] = useState<IncidentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const result = await listSharedIncidents();
    setRefreshing(false);
    setItems(result.incidents);
    setError(result.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listSharedIncidents().then((result) => {
      if (cancelled) return;
      setItems(result.incidents);
      setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items) return <LoadingState label="Loading incidents…" />;
  if (error && items.length === 0) {
    return (
      <View style={styles.center}>
        <ErrorState description={error} onRetry={load} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.list}
      refreshing={refreshing}
      onRefresh={load}
      ListEmptyComponent={
        <EmptyState
          title="No incidents"
          description="If someone who listed you as a trusted contact needs support, it shows up here. Sign in with the email they saved for you."
        />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/incident/[token]", params: { token: item.id } })}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <Text style={type.heading}>{item.personName} may need support</Text>
          <Text style={type.caption}>
            {ROLE_LABEL[item.role]} · {formatAgo(item.createdAt)}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: space(6), backgroundColor: colors.warmWhite },
  list: { gap: space(3), padding: space(4), flexGrow: 1 },
  card: { gap: space(1), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  pressed: { opacity: 0.85 },
});

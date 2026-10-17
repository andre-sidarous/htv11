import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Marker, Polyline } from "react-native-maps";
import { JamMapView, toMapCoord } from "@/components/map/JamMapView";
import { EmptyState } from "@/components/ui/States";
import { useDemoActions } from "@/hooks/useDemoActions";
import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import { campusWalk } from "@/lib/demo/campusWalk";
import { isSupabaseConfigured, mockServicesEnabled } from "@/lib/env";
import type { LocationUpdate } from "@/lib/types";
import { realtimeService } from "@/services";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";

/**
 * Developer check screen: verifies realtime, the map, and the demo registry.
 * Open it on two phones (Supabase configured) and tap "Send test location" on one.
 * Not part of the product; safe to delete before the demo.
 */
export default function DevScreen() {
  const jamId = campusWalk.jam.id;
  const channel = useJamChannel(jamId);
  const actions = useDemoActions();
  const [received, setReceived] = useState<LocationUpdate[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  useJamEvent(channel, "location_update", (update) => setReceived((prev) => [update, ...prev].slice(0, 5)));

  async function sendTestLocation() {
    if (!channel) return;
    setSendError(null);
    const member = campusWalk.members[0]!;
    try {
      await channel.send("location_update", {
        jamId,
        userId: member.userId,
        latitude: member.position.latitude + (Math.random() - 0.5) * 0.001,
        longitude: member.position.longitude + (Math.random() - 0.5) * 0.001,
        accuracy: 10,
        activity: "walking",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Send failed");
    }
  }

  const latest = received[0];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={type.heading}>Environment</Text>
        <Text style={type.caption}>Supabase configured: {String(isSupabaseConfigured)}</Text>
        <Text style={type.caption}>Mock services: {String(mockServicesEnabled)}</Text>
        <Text style={type.caption}>Realtime transport: {realtimeService.transport}</Text>
        <Text style={type.caption}>Channel: jam:{jamId}</Text>
      </View>

      <View style={styles.card}>
        <Text style={type.heading}>Realtime</Text>
        <Pressable
          accessibilityRole="button"
          disabled={!channel}
          onPress={sendTestLocation}
          style={({ pressed }) => [styles.button, (!channel || pressed) && styles.dim]}
        >
          <Text style={styles.buttonText}>Send test location</Text>
        </Pressable>
        {sendError ? <Text style={[type.caption, { color: colors.escalation }]}>{sendError}</Text> : null}
        {received.length === 0 ? <Text style={type.caption}>No events yet.</Text> : null}
        {received.map((u, i) => (
          <Text key={`${u.timestamp}-${i}`} style={styles.mono}>
            {u.timestamp.slice(11, 19)} {u.latitude.toFixed(5)}, {u.longitude.toFixed(5)}
          </Text>
        ))}
      </View>

      <View style={[styles.card, styles.mapCard]}>
        <JamMapView center={campusWalk.start} span={0.015}>
          <Polyline coordinates={campusWalk.plannedRoute.map(toMapCoord)} strokeColor={colors.navy} strokeWidth={4} />
          <Marker coordinate={toMapCoord(campusWalk.destination)} title={campusWalk.destination.name} />
          {latest ? <Marker coordinate={toMapCoord(latest)} pinColor={colors.amber} title="Test location" /> : null}
        </JamMapView>
      </View>

      <View style={styles.card}>
        <Text style={type.heading}>Screens in progress</Text>
        {(["/contacts", "/demo-control", "/incidents", "/notifications"] as const).map((href) => (
          <Link key={href} href={href} asChild>
            <Pressable accessibilityRole="link" style={styles.link}>
              <Text style={styles.linkText}>Open {href}</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={type.heading}>Registered demo actions</Text>
        {actions.length === 0 ? (
          <EmptyState title="None registered yet" description="P3 and P4 register actions in features/demo/demoActions.ts." />
        ) : (
          actions.map((a) => (
            <Text key={a.id} style={type.body}>
              • {a.label} <Text style={type.caption}>({a.owner})</Text>
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space(4), padding: space(4), paddingBottom: space(10) },
  card: { gap: space(2), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  mapCard: { height: 320, padding: 0, overflow: "hidden" },
  button: {
    minHeight: TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  dim: { opacity: 0.6 },
  buttonText: { color: colors.warmWhite, fontSize: 16, fontWeight: "600" },
  mono: { fontFamily: "monospace", fontSize: 12, color: colors.ink },
  link: { minHeight: TAP_TARGET, justifyContent: "center" },
  linkText: { color: colors.navy, fontSize: 16, fontWeight: "600", textDecorationLine: "underline" },
});

import * as Haptics from "expo-haptics";
import { router, type Href } from "expo-router";
import { memo, useEffect, useState } from "react";
import { BellRing, CircleCheck, Clock, EyeOff, FileText, HandHeart, Map as MapIcon, MapPin, Navigation, Phone } from "lucide-react-native";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Button, Icon, IconBadge } from "@/components/ui";
import { timelineFor } from "@/features/health/escalationStages";
import { mapUi } from "@/features/map/mapUiStore";
import type { AlertResponseKind, SafetyAlert } from "@/lib/types";
import { fonts, colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { acknowledgeAlert, getLastSeen, resolveAlert, respond, type LastSeen } from "./api";
import { alertHeadline, escalationLine, formatAgo, isAiCallState, responseStatus } from "./presentation";
import { useJamAlerts } from "./useJamAlerts";

/**
 * OWNER: P5. In-app alert cards ("Alex may need support."), rendered over every
 * active-Jam tab via <JamOverlayHost />. Not shown to the affected user themself.
 */
export function AlertOverlay({ jamId }: { jamId: string }) {
  const { me, alerts, names, responses, incidents, broadcast, addResponse } = useJamAlerts(jamId);
  const insets = useSafeAreaInsets();
  const visible = alerts.filter((a) => me && a.affectedUserId !== me);
  if (visible.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingTop: insets.top + space(2) }]}>
      {visible.slice(0, 2).map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          jamId={jamId}
          name={names[alert.affectedUserId] ?? "A Huddle member"}
          kinds={responses[alert.id] ?? []}
          incidentId={incidents[alert.id]}
          onUpdated={broadcast}
          onResponded={(kind) => addResponse(alert.id, kind)}
        />
      ))}
      {visible.length > 2 ? <Text style={[type.caption, styles.more]}>+{visible.length - 2} more alerts</Text> : null}
    </View>
  );
}

type CardProps = {
  alert: SafetyAlert;
  jamId: string;
  name: string;
  kinds: AlertResponseKind[];
  incidentId?: string;
  onUpdated: (alert: SafetyAlert) => Promise<void>;
  onResponded: (kind: AlertResponseKind) => void;
};

const AlertCard = memo(function AlertCard({ alert, jamId, name, kinds, incidentId, onUpdated, onResponded }: CardProps) {
  const [enter] = useState(() => new Animated.Value(0));
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState<"help" | "safe" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<LastSeen | null>(null);
  const [, tick] = useState(0);

  const resolved = Boolean(alert.resolvedAt);
  const status = responseStatus(kinds, resolved);
  const helping = kinds.includes("responding") || kinds.includes("acknowledged");
  const escalated = alert.escalationState === "CONTACTS_NOTIFIED" || alert.escalationState === "AI_CALL_USER_UNRESPONSIVE";

  // Calm entrance + light haptic, and mark it seen once.
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 }).start();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void respond(alert.id, "seen").then((e) => !e && onResponded("seen"));
    // Run once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getLastSeen(jamId, alert.affectedUserId).then((s) => !cancelled && setLastSeen(s));
    return () => {
      cancelled = true;
    };
  }, [jamId, alert.affectedUserId, alert.escalationState]);

  // Refresh the "N seconds ago" labels.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  async function help() {
    setBusy("help");
    setError(null);
    const { error: e, updated } = await acknowledgeAlert(alert);
    setBusy(null);
    if (e) return setError(e);
    onResponded("responding");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (updated) await onUpdated(updated);
  }

  async function markSafe() {
    setBusy("safe");
    setError(null);
    const { error: e, updated } = await resolveAlert(alert.id);
    setBusy(null);
    if (e) return setError(e);
    if (updated) await onUpdated(updated);
  }

  const style = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
  };

  const stages = timelineFor(alert.escalationState).stages;
  const accent = escalated ? colors.escalation : resolved ? colors.ok : colors.amber;

  if (collapsed) {
    return (
      <Animated.View style={style}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Show alert about ${name}`} onPress={() => setCollapsed(false)} style={[styles.pill, { borderColor: accent }]}>
          <View style={[styles.pillDot, { backgroundColor: accent }]} />
          <Text style={styles.pillText} maxFontSizeMultiplier={1.4}>
            {name} may need support · {status}
          </Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, style]} accessibilityLiveRegion="polite">
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <IconBadge icon={resolved ? CircleCheck : BellRing} tone={escalated ? "escalation" : resolved ? "ok" : "amber"} size={40} />
          <View style={styles.flex}>
            <Text style={type.overline}>{resolved ? "Resolved" : escalated ? "Escalated" : "Group alert"}</Text>
            <Text style={type.heading} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
              {alertHeadline(name, alert.checkinResponse, resolved)}
            </Text>
          </View>
          <Badge label={status} tone={resolved ? "ok" : "neutral"} />
        </View>

        {!resolved ? (
          <>
            <Text style={type.body} maxFontSizeMultiplier={1.6}>
              {escalationLine(alert.escalationState, name, alert.checkinResponse)}
            </Text>
            <View style={styles.steps} accessibilityLabel={`Escalation step ${stages.findIndex((st) => st.status === "active" || st.status === "settled") + 1} of ${stages.length}`}>
              {stages.map((st) => (
                <View
                  key={st.key}
                  style={[
                    styles.step,
                    (st.status === "done" || st.status === "settled") && { backgroundColor: colors.ok },
                    st.status === "active" && { backgroundColor: escalated ? colors.escalation : colors.brand },
                  ]}
                />
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.meta}>
          <View style={styles.metaRow}>
            <Icon icon={Clock} size={14} color={colors.inkMuted} />
            <Text style={type.caption}>
              {alert.checkinResponse ? `Alert started ${formatAgo(alert.createdAt)}` : `No response since ${formatAgo(alert.createdAt)}`}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Icon icon={MapPin} size={14} color={colors.inkMuted} />
            <Text style={type.caption}>
              {lastSeen ? `Last seen ${formatAgo(lastSeen.lastSeenAt)}` : "Location not shared"}
              {lastSeen?.activity ? ` · ${lastSeen.activity}` : ""}
            </Text>
          </View>
        </View>

        {alert.reasons.length > 0 && !resolved ? (
          <View style={styles.reasons}>
            {alert.reasons.slice(0, 3).map((r) => (
              <Text key={r} style={[type.caption, styles.reasonText]}>
                · {r}
              </Text>
            ))}
          </View>
        ) : null}

        {error ? <Text style={[type.caption, styles.error]}>{error}</Text> : null}

        {!resolved ? (
          <View style={styles.actions}>
            {lastSeen ? (
              <Button
                label={`Find ${name}`}
                icon={Navigation}
                variant={alert.checkinResponse === "im_lost" ? "primary" : "secondary"}
                accessibilityHint={`Shows a walking route from you to ${name} on the map`}
                onPress={() => {
                  mapUi.set({ guide: { kind: "member", userId: alert.affectedUserId, name } });
                  router.push(`/jam/${jamId}/map` as Href);
                }}
              />
            ) : null}
            <Button
              label={helping ? "You’re helping" : "I’m going to help"}
              icon={HandHeart}
              disabled={helping}
              loading={busy === "help"}
              onPress={help}
            />
            <View style={styles.actionRow}>
              <Button label="Open map" icon={MapIcon} variant="secondary" onPress={() => router.push(`/jam/${jamId}/map` as Href)} style={styles.flex} />
              {isAiCallState(alert.escalationState) ? (
                <Button label="Join call" icon={Phone} variant="secondary" onPress={() => router.push({ pathname: "/jam/[jamId]/support-call", params: { jamId } })} style={styles.flex} />
              ) : null}
              {incidentId ? (
                <Button label="Incident" icon={FileText} variant="secondary" onPress={() => router.push({ pathname: "/incident/[token]", params: { token: incidentId } })} style={styles.flex} />
              ) : null}
            </View>
            <View style={styles.actionRow}>
              <Button label="Mark safe" icon={CircleCheck} variant="outline" loading={busy === "safe"} onPress={markSafe} style={styles.flex} />
              <Button label="Hide" icon={EyeOff} variant="ghost" onPress={() => setCollapsed(true)} style={styles.flex} />
            </View>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  host: { position: "absolute", top: 0, left: 0, right: 0, gap: space(2), paddingHorizontal: space(3) },
  flex: { flex: 1 },
  more: { alignSelf: "center" },
  card: { flexDirection: "row", overflow: "hidden", borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.raised },
  accent: { width: 4 },
  body: { flex: 1, gap: space(3), padding: space(4) },
  row: { flexDirection: "row", alignItems: "center", gap: space(3) },
  steps: { flexDirection: "row", gap: space(1) },
  step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  meta: { gap: space(1) },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
  reasons: { gap: space(1), padding: space(3), borderRadius: radius.sm, backgroundColor: colors.lavender },
  reasonText: { color: colors.ink },
  error: { color: colors.escalation },
  actions: { gap: space(2) },
  actionRow: { flexDirection: "row", gap: space(2) },
  pill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    minHeight: TAP_TARGET - 4,
    paddingHorizontal: space(4),
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.surface,
    ...shadow.raised,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { color: colors.ink, fontSize: 14, fontFamily: fonts.semibold, fontWeight: "600" },
});

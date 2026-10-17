import { Activity, BellRing, Check, MessageCircleQuestionMark, Phone, Users, type LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/ui";
import type { EscalationState } from "@/lib/types";
import { colors, radius, space, type } from "@/theme";
import { timelineFor, type StageKey, type StageStatus } from "./escalationStages";

const ICONS: Record<StageKey, LucideIcon> = {
  monitoring: Activity,
  check_in: MessageCircleQuestionMark,
  group_alert: Users,
  ai_call: Phone,
  contacts: BellRing,
};

const STATUS_COPY: Record<StageStatus, string> = {
  done: "Done",
  active: "Now",
  settled: "Answered",
  upcoming: "Next",
  skipped: "Not needed",
};

/**
 * Monitoring → Check-in → Group alert → AI call → Contacts notified, for one alert.
 * Red appears only once contacts are notified (confirmed escalation); otherwise burgundy.
 */
export function EscalationTimeline({
  state,
  aiCallAllowed = true,
  startedAt,
  acknowledgedAt,
  deadlineAt,
  now,
}: {
  state: EscalationState | null;
  aiCallAllowed?: boolean;
  startedAt?: string | null;
  acknowledgedAt?: string | null;
  deadlineAt?: string | null;
  /** Pass a ticking clock to show "Next step in Ns"; omitted, no countdown is shown. */
  now?: number;
}) {
  const { stages, current, next } = timelineFor(state, aiCallAllowed);
  const escalated = state === "CONTACTS_NOTIFIED";
  const secondsToNext = deadlineAt && now != null ? Math.max(0, Math.ceil((Date.parse(deadlineAt) - now) / 1000)) : null;

  const timeFor = (key: StageKey): string | null => {
    if (key === "check_in" && startedAt) return clock(startedAt);
    if (key === "group_alert" && acknowledgedAt) return `Acknowledged ${clock(acknowledgedAt)}`;
    return null;
  };

  return (
    <View style={styles.wrap} accessibilityLabel={`Escalation: ${current}${next ? ` Next: ${next}` : ""}`}>
      {stages.map((stage, i) => {
        const active = stage.status === "active";
        const tint = active ? (escalated ? colors.escalation : colors.brand) : stage.status === "done" || stage.status === "settled" ? colors.ok : colors.inkFaint;
        const filled = active || stage.status === "done" || stage.status === "settled";
        const time = timeFor(stage.key);
        return (
          <View key={stage.key} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.node, filled ? { backgroundColor: tint, borderColor: tint } : styles.nodeIdle, stage.status === "skipped" && styles.nodeSkipped]}>
                <Icon icon={stage.status === "done" || stage.status === "settled" ? Check : ICONS[stage.key]} size={15} color={filled ? colors.surface : colors.inkFaint} strokeWidth={2.25} />
              </View>
              {i < stages.length - 1 ? <View style={[styles.line, stage.status === "done" && { backgroundColor: colors.ok }]} /> : null}
            </View>
            <View style={styles.text}>
              <View style={styles.labelRow}>
                <Text style={[type.label, !filled && styles.idleText, stage.status === "skipped" && styles.skipped]} maxFontSizeMultiplier={1.6}>
                  {stage.label}
                </Text>
                <Text style={[styles.status, { color: active ? tint : colors.inkMuted }]} maxFontSizeMultiplier={1.4}>
                  {active && secondsToNext !== null && secondsToNext > 0 ? `Next step in ${secondsToNext}s` : STATUS_COPY[stage.status]}
                </Text>
              </View>
              {active ? <Text style={type.caption}>{current}</Text> : null}
              {time ? <Text style={type.caption}>{time}</Text> : null}
            </View>
          </View>
        );
      })}
      {next ? (
        <View style={styles.next}>
          <Text style={type.caption} maxFontSizeMultiplier={1.8}>
            <Text style={styles.nextLabel}>Next: </Text>
            {next}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const NODE = 30;
const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: "row", gap: space(3) },
  rail: { width: NODE, alignItems: "center" },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  nodeIdle: { backgroundColor: colors.surface, borderColor: colors.border },
  nodeSkipped: { borderStyle: "dashed" },
  line: { flex: 1, width: 2, minHeight: space(4), backgroundColor: colors.border, marginVertical: 2 },
  text: { flex: 1, paddingTop: 5, paddingBottom: space(4), gap: 2 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space(2) },
  idleText: { color: colors.inkMuted, fontWeight: "500" },
  skipped: { textDecorationLine: "line-through" },
  status: { fontSize: 12, fontWeight: "700" },
  next: { padding: space(3), borderRadius: radius.sm, backgroundColor: colors.blushSoft },
  nextLabel: { fontWeight: "700", color: colors.brand },
});

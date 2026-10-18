import { MapPin } from "lucide-react-native";
import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Chip, Icon } from "@/components/ui";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { JamMemberRow, JamRow } from "@/lib/types";
import { colors, space, type } from "@/theme";
import { DestinationPicker } from "./DestinationPicker";
import { clearMyDestination, setMyDestination, updateDestinationMode, updateJamDestination } from "./jamsApi";
import type { Place } from "./placeSearch";
import { useCurrentPosition } from "./useCurrentPosition";

/**
 * Settings → Destination. The host changes the Huddle's destination for everyone; anyone can set
 * their own ("I'm heading somewhere else") or go back to the Huddle's. The group is told in the chat.
 */
export function DestinationCard({ jam, self, isHost, onChanged }: { jam: JamRow; self: JamMemberRow; isHost: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<"huddle" | "mine" | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = useCurrentPosition();

  const mine = self.destination_lat != null && self.destination_lng != null ? (self.destination_name ?? "Your new destination") : null;

  async function tellGroup(body: string) {
    await getSupabaseClient()?.from("chat_messages").insert({ jam_id: jam.id, user_id: self.user_id, body: body.slice(0, 1000) });
  }

  async function save() {
    if (!place || !editing) return;
    setSaving(true);
    setError(null);
    const { error: e } =
      editing === "huddle" ? await updateJamDestination(jam.id, place) : await setMyDestination(jam.id, self.user_id, place);
    if (!e) await tellGroup(editing === "huddle" ? `Changed the Huddle’s destination to ${place.name}.` : `I’m heading to ${place.name} instead.`);
    setSaving(false);
    if (e) return setError("Couldn’t save the destination. Try again.");
    setEditing(null);
    setPlace(null);
    onChanged();
  }

  const individual = jam.destination_mode === "individual";

  async function setMode(mode: "group" | "individual") {
    if (mode === jam.destination_mode) return;
    const { error: e } = await updateDestinationMode(jam.id, mode);
    if (e) return setError("Couldn’t change that. Try again.");
    await tellGroup(mode === "individual" ? "Everyone can pick their own destination now (Settings → Destination)." : `We’re all heading to ${jam.destination_name ?? "the same place"} now.`);
    onChanged();
  }

  async function backToHuddle() {
    setSaving(true);
    const { error: e } = await clearMyDestination(jam.id, self.user_id);
    if (!e && jam.destination_name) await tellGroup(`I’m heading to ${jam.destination_name} with the group again.`);
    setSaving(false);
    if (!e) onChanged();
  }

  return (
    <Card>
      <Text style={type.heading}>Destination</Text>
      {isHost ? (
        <View style={styles.chips}>
          <Chip label="Same place for everyone" selected={!individual} onPress={() => void setMode("group")} />
          <Chip label="Everyone picks their own" selected={individual} onPress={() => void setMode("individual")} />
        </View>
      ) : individual ? (
        <Text style={type.caption}>Everyone in this Huddle picks their own destination.</Text>
      ) : null}
      <View style={styles.row}>
        <Icon icon={MapPin} size={18} color={colors.brand} />
        <Text style={[type.body, styles.flex]}>
          {individual && !mine ? `${isHost ? "Yours" : "The host’s"}: ` : ""}
          {jam.destination_name ?? "No destination set"}
        </Text>
      </View>
      {mine ? <Text style={type.caption}>You’re heading to {mine} instead.</Text> : null}
      {isHost ? (
        <Button label={individual ? "Change my destination" : "Change the Huddle’s destination"} variant="secondary" onPress={() => setEditing("huddle")} />
      ) : null}
      {!isHost || !individual ? (
        <Button
          label={mine ? "Change my destination" : individual ? "Pick my destination" : "I’m heading somewhere else"}
          variant={isHost ? "ghost" : "secondary"}
          onPress={() => setEditing("mine")}
        />
      ) : null}
      {mine ? (
        <Button
          label={individual ? "Use the host’s destination" : "Go back to the Huddle’s destination"}
          variant="ghost"
          loading={saving && !editing}
          onPress={() => void backToHuddle()}
        />
      ) : null}

      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.sheet} edges={["top", "bottom"]}>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={type.title}>{editing === "huddle" && !individual ? "New Huddle destination" : "Where are you heading?"}</Text>
            <Text style={type.caption}>
              {editing === "huddle" && !individual
                ? "Everyone’s route updates and the group is told in the chat."
                : "Only your route changes. The group sees your new destination."}
            </Text>
            <DestinationPicker value={place} onChange={setPlace} near={here.position} disabled={saving} />
            {error ? <Text style={{ color: colors.escalation }}>{error}</Text> : null}
            <Button label="Save destination" disabled={!place} loading={saving} onPress={() => void save()} />
            <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space(2) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  flex: { flex: 1 },
  sheet: { flex: 1, backgroundColor: colors.warmWhite },
  sheetBody: { gap: space(4), padding: space(5) },
});

import { Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { SessionGate } from "@/features/alerts/SessionGate";
import { testContactCall } from "@/lib/supabase/functions";
import type { TrustedContactRow } from "@/lib/types";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { ContactForm } from "./ContactForm";
import { CONFIRMATION_LABELS, describeSharing, emptyContactForm, toFormValues } from "./schema";
import { useTrustedContacts } from "./useTrustedContacts";

/** OWNER: P5. Trusted contacts management (route: /contacts). */
export function ContactsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Trusted contacts" }} />
      <SessionGate>
        <ContactsList />
      </SessionGate>
    </>
  );
}

function ContactsList() {
  const { contacts, loading, error, reload, save, remove } = useTrustedContacts();
  const [editing, setEditing] = useState<TrustedContactRow | "new" | null>(null);

  function confirmRemove(contact: TrustedContactRow) {
    Alert.alert(`Remove ${contact.name}?`, "Jam will no longer contact them.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const message = await remove(contact.id);
          if (message) Alert.alert("Couldn't remove", message);
        },
      },
    ]);
  }

  if (loading && contacts.length === 0) return <LoadingState label="Loading your contacts…" />;
  if (error && contacts.length === 0) {
    return (
      <View style={styles.padded}>
        <ErrorState description={error} onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={contacts}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={reload}
        ListHeaderComponent={
          <Text style={[type.body, styles.intro]}>
            If you stop responding to your group and to Jam’s support call, Jam calls and texts these people and shares only what you allow. Only you can see their details.
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            title="No trusted contacts yet"
            description="Add someone who'd want to know if you need support, like a family member or close friend."
          />
        }
        renderItem={({ item }) => <ContactCard contact={item} onEdit={() => setEditing(item)} onRemove={() => confirmRemove(item)} />}
      />

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={() => setEditing("new")} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Add a trusted contact</Text>
        </Pressable>
      </View>

      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        {editing !== null ? (
          <View style={styles.sheet}>
            <ContactForm
              title={editing === "new" ? "New contact" : "Edit contact"}
              initial={editing === "new" ? emptyContactForm : toFormValues(editing)}
              onCancel={() => setEditing(null)}
              onSubmit={async (input) => {
                const message = await save(input, editing === "new" ? undefined : editing.id);
                if (!message) setEditing(null);
                return message;
              }}
            />
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

function ContactCard({ contact, onEdit, onRemove }: { contact: TrustedContactRow; onEdit: () => void; onRemove: () => void }) {
  const status = contact.confirmation_status;
  const [testing, setTesting] = useState(false);

  async function testCall() {
    setTesting(true);
    const result = await testContactCall(contact.id);
    setTesting(false);
    if (result.status === "sent") Alert.alert("Test call placed", `${contact.name}'s phone should ring in a few seconds.`);
    else Alert.alert("Couldn't place the test call", result.detail ?? "Try again in a moment.");
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.avatarText}>{contact.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={type.heading}>{contact.name}</Text>
          {contact.relationship ? <Text style={type.caption}>{contact.relationship}</Text> : null}
        </View>
        <View style={[styles.badge, status === "confirmed" ? styles.badgeOk : status === "declined" ? styles.badgeMuted : styles.badgeWait]}>
          <Text style={styles.badgeText}>{CONFIRMATION_LABELS[status]}</Text>
        </View>
      </View>

      {contact.phone_number ? <Text style={type.body}>{contact.phone_number}</Text> : <Text style={[type.caption, styles.warn]}>No phone number, so Jam can’t call them.</Text>}
      {contact.email ? <Text style={type.caption}>{contact.email}</Text> : null}
      <Text style={[type.caption, styles.sharing]}>{describeSharing(contact)}</Text>

      <View style={styles.actions}>
        {contact.phone_number ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Send a test call to ${contact.name}`}
            accessibilityState={{ busy: testing }}
            disabled={testing}
            onPress={testCall}
            style={styles.secondary}
          >
            {testing ? <ActivityIndicator color={colors.navy} /> : <Text style={styles.secondaryText}>Test call</Text>}
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${contact.name}`} onPress={onEdit} style={styles.secondary}>
          <Text style={styles.secondaryText}>Edit</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${contact.name}`} onPress={onRemove} style={styles.secondary}>
          <Text style={styles.secondaryText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.warmWhite },
  padded: { flex: 1, justifyContent: "center", padding: space(6), backgroundColor: colors.warmWhite },
  sheet: { flex: 1, backgroundColor: colors.warmWhite },
  flex: { flex: 1 },
  list: { gap: space(3), padding: space(4), paddingBottom: space(28) },
  intro: { color: colors.inkMuted, marginBottom: space(2) },
  card: { gap: space(2), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space(3) },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.sky },
  avatarText: { fontSize: 18, fontWeight: "700", color: colors.navy },
  badge: { paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: radius.pill },
  badgeOk: { backgroundColor: colors.okSoft },
  badgeWait: { backgroundColor: colors.amberSoft },
  badgeMuted: { backgroundColor: colors.border },
  badgeText: { fontSize: 12, fontWeight: "600", color: colors.ink },
  warn: { color: colors.ink },
  sharing: { color: colors.navySoft },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space(3), marginTop: space(1) },
  secondary: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space(5),
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.navy, fontSize: 15, fontWeight: "600" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: space(4),
    paddingBottom: space(8),
    backgroundColor: colors.warmWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  primary: { minHeight: TAP_TARGET, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.navy },
  pressed: { opacity: 0.85 },
  primaryText: { color: colors.warmWhite, fontSize: 16, fontWeight: "600" },
});

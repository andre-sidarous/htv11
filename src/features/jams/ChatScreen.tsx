import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react-native";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, ErrorState, Icon, LoadingState } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import type { ChatMessageRow } from "@/lib/types";
import { fonts, colors, radius, space, type } from "@/theme";
import { chatUnread } from "./chatUnread";
import { useChatMessages } from "./useChatMessages";
import { useJamMembers } from "./useJamMembers";

/** The default stack header ("Chat") above this screen: 44pt on iOS, 56dp on Android, plus the status bar. */
const HEADER_HEIGHT = Platform.OS === "ios" ? 44 : 56;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Group chat for everyone currently in this Jam. Persisted, so it's there when you reopen the app. */
export function ChatScreen({ jamId }: { jamId: string }) {
  const { session } = useSession();
  const myId = session?.user.id;
  const { messages, loading, error, send, refresh } = useChatMessages(jamId);
  const { members } = useJamMembers(jamId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessageRow>>(null);
  const insets = useSafeAreaInsets();

  // While this screen is open, new messages aren't "unread" and no banner shows.
  useEffect(() => {
    chatUnread.opened(jamId);
    return () => chatUnread.closed(jamId);
  }, [jamId]);

  // Keep the newest message in view when the keyboard opens.
  useEffect(() => {
    const sub = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () =>
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })),
    );
    return () => sub.remove();
  }, []);

  const namesById = useMemo(
    () => new Map(members.map((m) => [m.user_id, m.profile?.display_name ?? "Member"])),
    [members],
  );

  useEffect(() => {
    if (messages.length > 0) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    const errorMessage = await send(text);
    setSending(false);
    if (errorMessage) {
      setSendError(errorMessage);
      return;
    }
    setDraft("");
  }

  function renderItem({ item, index }: ListRenderItemInfo<ChatMessageRow>) {
    const isSelf = item.user_id === myId;
    const name = namesById.get(item.user_id) ?? "Member";
    const previous = messages[index - 1];
    const showSender = !isSelf && (!previous || previous.user_id !== item.user_id);

    return (
      <View style={[styles.row, isSelf ? styles.rowSelf : styles.rowOther]}>
        {!isSelf ? <View style={styles.avatarSlot}>{showSender ? <Avatar name={name} size={28} /> : null}</View> : null}
        <View style={styles.bubbleColumn}>
          {showSender ? (
            <Text style={styles.sender} maxFontSizeMultiplier={1.6}>
              {name}
            </Text>
          ) : null}
          <View style={[styles.bubble, isSelf ? styles.bubbleSelf : styles.bubbleOther]}>
            <Text style={[type.body, isSelf && styles.bubbleTextSelf]} maxFontSizeMultiplier={1.8}>
              {item.body}
            </Text>
          </View>
          <Text style={[styles.time, isSelf && styles.timeSelf]} maxFontSizeMultiplier={1.6}>
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) return <LoadingState label="Loading chat…" />;
  if (error && messages.length === 0) return <ErrorState description={error} onRetry={() => void refresh()} />;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom", "left", "right"]}>
      {/* "padding" on both platforms: SDK 57 Android draws edge-to-edge, so the window no longer
          resizes for the keyboard and the composer would sit underneath it. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={insets.top + HEADER_HEIGHT}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={type.heading}>No messages yet</Text>
            <Text style={type.caption} maxFontSizeMultiplier={1.6}>
              Say hi to your Huddle.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <View style={styles.inputRow}>
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message your Huddle"
              placeholderTextColor={colors.inkFaint}
              multiline
              maxLength={1000}
              style={styles.textInput}
              accessibilityLabel="Message"
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => void handleSend()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={!draft.trim() || sending}
              onPress={() => void handleSend()}
              style={({ pressed }) => [
                styles.sendButton,
                (!draft.trim() || sending) && styles.sendDisabled,
                pressed && draft.trim() && styles.sendPressed,
              ]}
            >
              <Icon icon={Send} size={18} color={colors.surface} strokeWidth={2} />
            </Pressable>
          </View>
          {sendError ? (
            <Text accessibilityRole="alert" style={styles.sendError} maxFontSizeMultiplier={1.8}>
              {sendError}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.warmWhite },
  flex: { flex: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(1) },
  list: { padding: space(4), gap: space(3) },
  row: { flexDirection: "row", alignItems: "flex-end", gap: space(2) },
  rowSelf: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  avatarSlot: { width: 28 },
  bubbleColumn: { maxWidth: "78%", gap: space(1) },
  sender: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: "600", color: colors.inkMuted, marginLeft: space(1) },
  bubble: { paddingHorizontal: space(4), paddingVertical: space(2.5), borderRadius: radius.lg },
  bubbleSelf: { backgroundColor: colors.brand, borderBottomRightRadius: space(1) },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderBottomLeftRadius: space(1),
  },
  bubbleTextSelf: { color: colors.surface },
  time: { fontSize: 11, color: colors.inkFaint, marginLeft: space(1) },
  timeSelf: { alignSelf: "flex-end", marginRight: space(1) },
  inputRow: {
    paddingHorizontal: space(4),
    paddingTop: space(2),
    paddingBottom: space(3),
    gap: space(1),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.warmWhite,
  },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space(2) },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    paddingVertical: space(2.5),
    fontSize: 16,
    color: colors.ink,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.4 },
  sendPressed: { opacity: 0.85 },
  sendError: { fontSize: 13, color: colors.escalation },
});

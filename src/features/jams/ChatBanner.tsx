import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { MessageCircle, X } from "lucide-react-native";
import { useEffect, useId, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatMessageRow } from "@/lib/types";
import { colors, radius, shadow, space, type } from "@/theme";
import { chatUnread } from "./chatUnread";

const SHOW_MS = 5_000;

/**
 * "Shivam: where are you?" — a banner over the Huddle tabs when someone else posts in the chat
 * and you're not looking at it. Tap to open the chat. Mounted once in the tabs layout.
 * (With the app closed there's nothing to show: Expo Go can't receive push notifications.)
 */
export function ChatBanner({ jamId }: { jamId: string }) {
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const insets = useSafeAreaInsets();
  const instanceId = useId();
  const [banner, setBanner] = useState<{ name: string; body: string; key: string } | null>(null);
  const [slide] = useState(() => new Animated.Value(0));
  const names = useRef(new Map<string, string>());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const myIdRef = useRef(myId);
  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !jamId) return;

    async function nameOf(userId: string): Promise<string> {
      const known = names.current.get(userId);
      if (known) return known;
      const { data } = await supabase!.from("member_profiles").select("display_name").eq("id", userId).maybeSingle();
      const name = (data?.display_name as string | undefined) ?? "Someone";
      names.current.set(userId, name);
      return name;
    }

    const channel = supabase
      .channel(`chat-banner:${jamId}:${instanceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `jam_id=eq.${jamId}` }, (payload) => {
        const row = payload.new as ChatMessageRow;
        if (!chatUnread.received(jamId, row.user_id, myIdRef.current)) return;
        void nameOf(row.user_id).then((name) => {
          clearTimeout(hideTimer.current);
          setBanner({ name, body: row.body, key: row.id });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Animated.spring(slide, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
          hideTimer.current = setTimeout(() => {
            Animated.timing(slide, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setBanner(null));
          }, SHOW_MS);
        });
      })
      .subscribe();

    return () => {
      clearTimeout(hideTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [jamId, instanceId, slide]);

  if (!banner) return null;

  const dismiss = () => {
    clearTimeout(hideTimer.current);
    setBanner(null);
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + space(2) }]}>
      <Animated.View
        style={{
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`New message from ${banner.name}: ${banner.body}. Opens the chat.`}
          accessibilityLiveRegion="polite"
          onPress={() => {
            dismiss();
            router.push({ pathname: "/jam/[jamId]/chat", params: { jamId } });
          }}
          style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
        >
          <View style={styles.iconWrap}>
            <Icon icon={MessageCircle} size={18} color={colors.surface} />
          </View>
          <View style={styles.text}>
            <Text style={type.label} numberOfLines={1}>
              {banner.name}
            </Text>
            <Text style={type.body} numberOfLines={2}>
              {banner.body}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} onPress={dismiss}>
            <Icon icon={X} size={18} color={colors.inkMuted} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: space(3), right: space(3), zIndex: 50 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    padding: space(4),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.raised,
  },
  pressed: { opacity: 0.9 },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  text: { flex: 1, gap: 2 },
});

import { useLocalSearchParams } from "expo-router";
import { ChatScreen } from "@/features/jams/ChatScreen";

export default function ChatRoute() {
  const { jamId } = useLocalSearchParams<{ jamId: string }>();
  return <ChatScreen jamId={jamId} />;
}

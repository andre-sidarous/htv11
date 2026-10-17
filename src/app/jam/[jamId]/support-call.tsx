import { useLocalSearchParams } from "expo-router";
import { SupportCallScreen } from "@/features/ai/SupportCallScreen";

// Thin route (foundation). P4 edits features/ai/SupportCallScreen.tsx.
export default function SupportCallRoute() {
  const { jamId } = useLocalSearchParams<{ jamId: string }>();
  return <SupportCallScreen jamId={jamId} />;
}

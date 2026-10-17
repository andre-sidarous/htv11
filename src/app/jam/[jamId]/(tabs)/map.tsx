import { useLocalSearchParams } from "expo-router";
import { JamMapScreen } from "@/features/map/JamMapScreen";

// Thin route (foundation). P3 edits features/map/JamMapScreen.tsx.
export default function MapTabRoute() {
  const { jamId } = useLocalSearchParams<{ jamId: string }>();
  return <JamMapScreen jamId={jamId} />;
}

import { useJamId } from "@/features/jams/JamIdContext";
import { JamMapScreen } from "@/features/map/JamMapScreen";

// Thin route (foundation). P3 edits features/map/JamMapScreen.tsx.
export default function MapTabRoute() {
  return <JamMapScreen jamId={useJamId()} />;
}

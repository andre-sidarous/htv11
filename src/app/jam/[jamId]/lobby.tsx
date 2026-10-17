import { useLocalSearchParams } from "expo-router";
import { LobbyScreen } from "@/features/jams/LobbyScreen";

export default function LobbyRoute() {
  const { jamId } = useLocalSearchParams<{ jamId: string }>();
  return <LobbyScreen jamId={jamId} />;
}

import { useLocalSearchParams } from "expo-router";
import { SettingsScreen } from "@/features/jams/SettingsScreen";

export default function SettingsTabRoute() {
  const { jamId } = useLocalSearchParams<{ jamId: string }>();
  return <SettingsScreen jamId={jamId} />;
}

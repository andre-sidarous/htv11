import { useJamId } from "@/features/jams/JamIdContext";
import { SettingsScreen } from "@/features/jams/SettingsScreen";

export default function SettingsTabRoute() {
  return <SettingsScreen jamId={useJamId()} />;
}

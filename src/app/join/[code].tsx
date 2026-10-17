import { useLocalSearchParams } from "expo-router";
import { JoinJamScreen } from "@/features/jams/JoinJamScreen";

/** Reached via the `jam://join/<code>` deep link shared from Create Jam's Share button. */
export default function JoinByCodeRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinJamScreen initialCode={code} />;
}

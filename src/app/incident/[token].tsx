import { useLocalSearchParams } from "expo-router";
import { IncidentScreen } from "@/features/alerts/IncidentScreen";

// Thin route (foundation). P5 edits features/alerts/IncidentScreen.tsx.
export default function IncidentRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <IncidentScreen token={token} />;
}

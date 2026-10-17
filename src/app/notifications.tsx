import { useLocalSearchParams } from "expo-router";
import { NotificationSettings } from "@/features/alerts/NotificationSettings";

// Thin route. P5 edits features/alerts/NotificationSettings.tsx. Link with ?jamId=<id>.
export default function NotificationsRoute() {
  const { jamId } = useLocalSearchParams<{ jamId?: string }>();
  return <NotificationSettings jamId={jamId} />;
}

import { useLocalSearchParams } from "expo-router";
import { GroupScreen } from "@/features/jams/GroupScreen";

export default function GroupTabRoute() {
  const { jamId } = useLocalSearchParams<{ jamId: string }>();
  return <GroupScreen jamId={jamId} />;
}

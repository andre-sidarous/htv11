import { useJamId } from "@/features/jams/JamIdContext";
import { GroupScreen } from "@/features/jams/GroupScreen";

export default function GroupTabRoute() {
  return <GroupScreen jamId={useJamId()} />;
}

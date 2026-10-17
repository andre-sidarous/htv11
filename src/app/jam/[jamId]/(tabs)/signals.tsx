import { useJamId } from "@/features/jams/JamIdContext";
import { SignalsScreen } from "@/features/jams/SignalsScreen";

export default function SignalsTabRoute() {
  return <SignalsScreen jamId={useJamId()} />;
}

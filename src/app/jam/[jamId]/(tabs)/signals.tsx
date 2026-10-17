import { useLocalSearchParams } from "expo-router";
import { SignalsScreen } from "@/features/jams/SignalsScreen";

export default function SignalsTabRoute() {
  const { jamId } = useLocalSearchParams<{ jamId: string }>();
  return <SignalsScreen jamId={jamId} />;
}

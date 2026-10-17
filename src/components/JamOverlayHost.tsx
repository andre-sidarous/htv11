import { StyleSheet, View } from "react-native";
import { AlertOverlay } from "@/features/alerts/AlertOverlay";
import { CheckInOverlay } from "@/features/health/CheckInOverlay";

/**
 * Mount point for cross-feature overlays during an active Jam. P2 renders this once in the
 * active-Jam tabs layout; P4 and P5 edit only their own overlay files, so nobody conflicts.
 */
export function JamOverlayHost({ jamId }: { jamId: string }) {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <AlertOverlay jamId={jamId} />
      <CheckInOverlay jamId={jamId} />
    </View>
  );
}

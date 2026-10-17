import { StyleSheet, View } from "react-native";
import { Marker, Polyline } from "react-native-maps";
import { JamMapView, toMapCoord } from "@/components/map/JamMapView";
import { campusWalk } from "@/lib/demo/campusWalk";
import { colors } from "@/theme";

/**
 * OWNER: P3. The Map tab renders <JamMapScreen jamId />. P2 mounts it; P3 replaces the body.
 * Keep the export name and props stable.
 */
export function JamMapScreen({ jamId: _jamId }: { jamId: string }) {
  return (
    <View style={styles.screen}>
      <JamMapView center={campusWalk.start} span={0.015}>
        <Polyline coordinates={campusWalk.plannedRoute.map(toMapCoord)} strokeColor={colors.navy} strokeWidth={4} />
        <Marker coordinate={toMapCoord(campusWalk.destination)} title={campusWalk.destination.name} />
      </JamMapView>
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });

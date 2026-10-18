import { forwardRef, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import MapView, { type Region } from "react-native-maps";
import type { LatLng } from "@/lib/types";

/**
 * Base map for every Jam screen (react-native-maps: Apple Maps on iOS, Google Maps on Android;
 * both work inside Expo Go with no API key). Children are react-native-maps layers:
 *
 *   import { Marker, Polyline } from "react-native-maps";
 *   <JamMapView center={campusWalk.start}>
 *     <Marker coordinate={toMapCoord(point)} />
 *     <Polyline coordinates={route.coordinates.map(toMapCoord)} />
 *   </JamMapView>
 *
 * Map points use { latitude, longitude }, the same shape as our LatLng, so no conversion is
 * needed beyond toMapCoord (which just strips extra fields).
 */
export type JamMapViewProps = {
  center: LatLng;
  /** Approximate visible span in degrees (0.01 ≈ 1 km). */
  span?: number;
  style?: StyleProp<ViewStyle>;
  showsUserLocation?: boolean;
  /** Fires after the user pans or zooms (e.g. to draw only the markers in view). */
  onRegionChangeComplete?: (region: Region) => void;
  /** Tap on the map (not on a marker): e.g. drop a destination pin. */
  onPress?: (point: LatLng) => void;
  /** The person dragged the map (e.g. stop following their position). */
  onPanDrag?: () => void;
  /** Show the platform's points of interest (shops, stations) — useful when picking a place. */
  showsPointsOfInterest?: boolean;
  accessibilityLabel?: string;
  children?: ReactNode;
};

export const toMapCoord = (p: LatLng) => ({ latitude: p.latitude, longitude: p.longitude });

export const regionAround = (center: LatLng, span = 0.012): Region => ({
  latitude: center.latitude,
  longitude: center.longitude,
  latitudeDelta: span,
  longitudeDelta: span,
});

export const JamMapView = forwardRef<MapView, JamMapViewProps>(function JamMapView(
  {
    center,
    span,
    style,
    showsUserLocation = false,
    onRegionChangeComplete,
    onPress,
    onPanDrag,
    showsPointsOfInterest = false,
    accessibilityLabel = "Huddle map",
    children,
  },
  ref,
) {
  return (
    <MapView
      ref={ref}
      style={[styles.map, style]}
      initialRegion={regionAround(center, span)}
      showsUserLocation={showsUserLocation}
      onRegionChangeComplete={onRegionChangeComplete}
      onPress={onPress ? (e) => onPress(toMapCoord(e.nativeEvent.coordinate)) : undefined}
      onPanDrag={onPanDrag}
      showsPointsOfInterests={showsPointsOfInterest}
      toolbarEnabled={false}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </MapView>
  );
});

const styles = StyleSheet.create({ map: { flex: 1, minHeight: 240 } });

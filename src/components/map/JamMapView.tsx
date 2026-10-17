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
  { center, span, style, showsUserLocation = false, onRegionChangeComplete, children },
  ref,
) {
  return (
    <MapView
      ref={ref}
      style={[styles.map, style]}
      initialRegion={regionAround(center, span)}
      showsUserLocation={showsUserLocation}
      onRegionChangeComplete={onRegionChangeComplete}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
      accessibilityLabel="Huddle map"
    >
      {children}
    </MapView>
  );
});

const styles = StyleSheet.create({ map: { flex: 1, minHeight: 240 } });

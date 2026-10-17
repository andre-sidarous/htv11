import { MapPin, Search, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type MapView from "react-native-maps";
import { Marker } from "react-native-maps";
import { JamMapView, regionAround, toMapCoord } from "@/components/map/JamMapView";
import { Chip, Icon } from "@/components/ui";
import { campusWalk } from "@/lib/demo/campusWalk";
import type { LatLng } from "@/lib/types";
import { colors, radius, space, TAP_TARGET, type } from "@/theme";
import { CAMPUS_WALK_DESTINATION } from "./destinations";
import { placeAt, searchPlaces, type Place } from "./placeSearch";

/** Search bias when we don't know where they are: downtown Toronto. */
const CITY_CENTRE: LatLng = { latitude: 43.6532, longitude: -79.3832 };
const SEARCH_DEBOUNCE_MS = 300;

export const CAMPUS_WALK_PLACE: Place = { ...CAMPUS_WALK_DESTINATION, address: "Campus Walk demo · Bloor St W & St George St" };

/**
 * Google-Maps-style destination picker: search any place or address (suggestions as you type,
 * nearest first), or tap the map to drop a pin. The Campus Walk demo stays one tap away.
 */
export function DestinationPicker({
  value,
  onChange,
  near,
  disabled,
}: {
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** Their position, to rank nearby results first and centre the map. */
  near: LatLng | null;
  disabled?: boolean;
}) {
  const mapRef = useRef<MapView>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<{ q: string; places: Place[] | null } | null>(null);
  const pinRequest = useRef(0);

  const q = query.trim();
  const showResults = focused && q.length >= 2;
  const searching = showResults && results?.q !== q;

  // Suggestions as they type (debounced; stale requests are aborted).
  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchPlaces(q, near ?? CITY_CENTRE, { signal: controller.signal }).then((places) => {
        if (!controller.signal.aborted) setResults({ q, places });
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, near]);

  function focusMap(point: LatLng) {
    mapRef.current?.animateToRegion(regionAround(point, 0.012), 450);
  }

  function choose(place: Place) {
    pinRequest.current++;
    onChange(place);
    setQuery("");
    setFocused(false);
    Keyboard.dismiss();
    focusMap(place);
  }

  /** Tap on the map: drop a pin right away, then fill in its name. */
  function dropPin(point: LatLng) {
    if (disabled) return;
    const request = ++pinRequest.current;
    onChange({ ...point, name: "Dropped pin", address: "Finding the address…" });
    setFocused(false);
    Keyboard.dismiss();
    void placeAt(point).then((place) => {
      if (pinRequest.current === request) onChange(place);
    });
  }

  const center = value ?? near ?? campusWalk.start;

  return (
    <View style={styles.wrap}>
      <View style={[styles.searchBox, focused && styles.searchBoxFocused]}>
        <Icon icon={Search} size={18} color={colors.inkMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          placeholder={value ? "Search for another place" : "Where to? Search a place or address"}
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          editable={!disabled}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search for a destination"
          maxFontSizeMultiplier={1.6}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => setQuery("")}>
            <Icon icon={X} size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      {showResults ? (
        <View style={styles.results} accessibilityLiveRegion="polite">
          {searching ? (
            <View style={styles.resultState}>
              <ActivityIndicator color={colors.brand} />
              <Text style={type.caption}>Searching…</Text>
            </View>
          ) : results?.places === null ? (
            <Text style={[type.caption, styles.resultState]}>Search isn’t reachable right now. Tap the map to drop a pin instead.</Text>
          ) : results?.places.length === 0 ? (
            <Text style={[type.caption, styles.resultState]}>No places found for “{q}”. Try a street address, or tap the map.</Text>
          ) : (
            results?.places.map((place, i) => (
              <Pressable
                key={`${place.name}-${place.latitude}-${place.longitude}`}
                accessibilityRole="button"
                accessibilityLabel={`${place.name}, ${place.address}`}
                onPress={() => choose(place)}
                style={({ pressed }) => [styles.resultRow, i > 0 && styles.resultDivider, pressed && styles.pressed]}
              >
                <Icon icon={MapPin} size={18} color={colors.brand} />
                <View style={styles.flex}>
                  <Text style={type.label} numberOfLines={1}>
                    {place.name}
                  </Text>
                  {place.address ? (
                    <Text style={type.caption} numberOfLines={1}>
                      {place.address}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {value ? (
        <View style={styles.selected}>
          <View style={styles.pinBadge}>
            <Icon icon={MapPin} size={18} color={colors.surface} />
          </View>
          <View style={styles.flex}>
            <Text style={type.heading} numberOfLines={2}>
              {value.name}
            </Text>
            {value.address ? <Text style={type.caption}>{value.address}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove destination" hitSlop={12} onPress={() => onChange(null)} disabled={disabled}>
            <Icon icon={X} size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.mapFrame}>
        <JamMapView
          ref={mapRef}
          center={center}
          span={value ? 0.012 : 0.03}
          style={styles.map}
          showsUserLocation={Boolean(near)}
          showsPointsOfInterest
          onPress={dropPin}
          accessibilityLabel="Map. Tap to drop a destination pin."
        >
          {value ? <Marker coordinate={toMapCoord(value)} title={value.name} description={value.address} pinColor={colors.brand} /> : null}
        </JamMapView>
      </View>
      <Text style={type.caption}>Tap the map to drop a pin anywhere.</Text>

      <View style={styles.chips}>
        <Chip label="Campus Walk (demo)" selected={value?.name === CAMPUS_WALK_PLACE.name} onPress={() => choose(CAMPUS_WALK_PLACE)} disabled={disabled} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(3) },
  flex: { flex: 1 },
  searchBox: {
    minHeight: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingHorizontal: space(4),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchBoxFocused: { borderColor: colors.brand },
  input: { flex: 1, minHeight: TAP_TARGET, ...type.body },
  results: { borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
  resultState: { flexDirection: "row", alignItems: "center", gap: space(2), padding: space(4) },
  resultRow: { minHeight: TAP_TARGET + 8, flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), paddingVertical: space(2) },
  resultDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.blushSoft },
  selected: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4), borderRadius: radius.sm, backgroundColor: colors.blushSoft },
  pinBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  mapFrame: { height: 220, borderRadius: radius.sm, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  map: { flex: 1, minHeight: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
});

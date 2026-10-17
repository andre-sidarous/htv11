import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import type { LatLng } from "@/lib/types";

export type PositionStatus = "checking" | "granted" | "undetermined" | "denied";

/**
 * This phone's position, once, for planning (search bias + travel time). Never prompts on its own:
 * `request()` asks only when the person taps the button that explains why.
 */
export function useCurrentPosition(): { position: LatLng | null; status: PositionStatus; request: () => Promise<void> } {
  const [status, setStatus] = useState<PositionStatus>("checking");
  const [position, setPosition] = useState<LatLng | null>(null);

  const locate = useCallback(async () => {
    try {
      const fix =
        (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (fix) setPosition({ latitude: fix.coords.latitude, longitude: fix.coords.longitude });
    } catch {
      // No fix (services off, indoors): planning still works without it.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (cancelled) return;
        setStatus(p.granted ? "granted" : p.canAskAgain ? "undetermined" : "denied");
        if (p.granted) void locate();
      })
      .catch(() => !cancelled && setStatus("denied"));
    return () => {
      cancelled = true;
    };
  }, [locate]);

  const request = useCallback(async () => {
    const p = await Location.requestForegroundPermissionsAsync().catch(() => null);
    setStatus(p?.granted ? "granted" : "denied");
    if (p?.granted) await locate();
  }, [locate]);

  return { position, status, request };
}

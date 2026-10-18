import { useSyncExternalStore } from "react";
import type { GuideRequest } from "./guideTarget";

/**
 * Map display toggles shared by the map screen and the map demo actions on this device.
 * Local to the phone that changes them (usually the presenter's, mirrored on the projector).
 */
export type MapUiState = {
  showDisruption: boolean;
  showAlternative: boolean;
  /** Bumped by "Reset locations" so screens clear breadcrumb trails. */
  resetCount: number;
  /** "Find Alex" / "Guide me back to my group": the map routes this phone to them. */
  guide: GuideRequest | null;
};

const initial: MapUiState = { showDisruption: false, showAlternative: false, resetCount: 0, guide: null };
let state = initial;
const listeners = new Set<() => void>();

export const mapUi = {
  get: () => state,
  set(update: Partial<MapUiState>) {
    state = { ...state, ...update };
    listeners.forEach((l) => l());
  },
  reset() {
    state = { ...initial, resetCount: state.resetCount + 1, guide: null };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useMapUi(): MapUiState {
  return useSyncExternalStore(mapUi.subscribe, mapUi.get, mapUi.get);
}

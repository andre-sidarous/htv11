import type { ImageSourcePropType } from "react-native";

/**
 * Huddle brand artwork (assets/brand). Pico is the mascot.
 *
 * Moods let screens ask for the right expression. Only the default pose exists today, so every
 * mood points at it; when more art lands (pico-wave.png, …), add it here and nothing else changes.
 * Keep moods calm: Pico never looks scared or alarmed (see the tone rules in CLAUDE.md).
 */
export type PicoMood = "default" | "wave" | "happy" | "concerned" | "waiting" | "walking";

const picoDefault: ImageSourcePropType = require("../../../assets/brand/pico.png");

export const PICO: Record<PicoMood, ImageSourcePropType> = {
  default: picoDefault,
  wave: picoDefault,
  happy: picoDefault,
  concerned: picoDefault,
  waiting: picoDefault,
  walking: picoDefault,
};

/** Width / height of pico.png, so callers can size by height or width without measuring. */
export const PICO_ASPECT = 841 / 1033;

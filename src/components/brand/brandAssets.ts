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

/** The Huddle wordmark (walking-penguin "u"), and the lockup with "N' Waddle" underneath. */
export const LOGO_WORDMARK: ImageSourcePropType = require("../../../assets/brand/logo-wordmark.png");
export const LOGO_SLOGAN: ImageSourcePropType = require("../../../assets/brand/logo-slogan.png");
/** Width / height of the trimmed logo files (1200x497 and 1200x499). */
export const LOGO_WORDMARK_ASPECT = 1200 / 497;
export const LOGO_SLOGAN_ASPECT = 1200 / 499;

/** Three penguins in scarves: the "your group" illustration for creating and joining a Huddle. */
export const PENGUIN_HUDDLE: ImageSourcePropType = require("../../../assets/brand/penguin-huddle.png");
export const PENGUIN_HUDDLE_ASPECT = 1000 / 846;

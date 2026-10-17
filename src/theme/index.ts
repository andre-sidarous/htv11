import type { TextStyle } from "react-native";

/**
 * Design tokens: the Jam template (see "Design system" in CLAUDE.md). P2 owns the visual design
 * and may tune VALUES; keep the NAMES stable so P3/P4/P5 can use them.
 *
 * Burgundy is the BRAND colour, not an alarm. Red (`colors.escalation`) is reserved for
 * confirmed escalation only. Aim for ~70% neutrals, ~20% burgundy, ~10% pastels/status.
 *
 * Legacy names (`navy`, `sky`, …) predate the template and now hold template values, so older
 * screens restyle automatically. Prefer the semantic names (`brand`, `blush`, …) in new code.
 */
const palette = {
  burgundy: "#7D1725",
  burgundyDark: "#4A1018",
  burgundyMid: "#9A3A47",
  ivory: "#F8F4F1",
  white: "#FFFFFF",
  blush: "#F1D8D9",
  blushSoft: "#F8ECEC",
  lavender: "#E3E0ED",
  sage: "#DCE8E2",
  charcoal: "#25272C",
  grey: "#77747A",
  greyFaint: "#ABA6AB",
  amber: "#D99A36",
  red: "#DC4545",
  green: "#3D7A5C",
} as const;

export const colors = {
  // Brand
  brand: palette.burgundy,
  brandDark: palette.burgundyDark,
  brandMuted: palette.burgundyMid,
  // Pastel accents (secondary cards, avatars, selected states)
  blush: palette.blush,
  blushSoft: palette.blushSoft,
  lavender: palette.lavender,
  lavenderInk: "#4B4566",
  sage: palette.sage,

  // Legacy names → template values
  navy: palette.burgundy,
  navySoft: palette.burgundyMid,
  warmWhite: palette.ivory,
  surface: palette.white,
  sky: palette.blush,
  skyStrong: "#D9A9AD",

  // Status
  amber: palette.amber,
  amberInk: "#8A5A12",
  amberSoft: "#F8EBD3",
  escalation: palette.red,
  escalationSoft: "#FBE6E5",
  ok: palette.green,
  okSoft: palette.sage,

  // Text and lines
  ink: palette.charcoal,
  inkMuted: palette.grey,
  inkFaint: palette.greyFaint,
  border: "#ECE4DF",
  hairline: "rgba(37, 39, 44, 0.08)",
  overlay: "rgba(37, 39, 44, 0.42)",

  // AI support call (dark surface)
  callBg: palette.burgundyDark,
  callSurface: "#5E1A24",
  callSurfaceStrong: "#73252F",
  callAccent: "#E9A9B0",
  callInk: "#FBF1F1",
  callInkMuted: "rgba(251, 241, 241, 0.68)",
} as const;

/** 4-point spacing scale: space(4) === 16. */
export const space = (steps: number) => steps * 4;

export const radius = { sm: 10, md: 14, card: 16, lg: 18, pill: 999 } as const;

/** Minimum comfortable tap target (iOS HIG 44pt, Material 48dp). */
export const TAP_TARGET = 48;

export const type = {
  display: { fontSize: 34, fontWeight: "700", letterSpacing: -0.6, color: colors.ink },
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.3, color: colors.ink },
  heading: { fontSize: 17, fontWeight: "600", color: colors.ink },
  body: { fontSize: 16, lineHeight: 22, color: colors.ink },
  bodyMuted: { fontSize: 16, lineHeight: 22, color: colors.inkMuted },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  caption: { fontSize: 13, lineHeight: 18, color: colors.inkMuted },
  /** Small uppercase section label ("ACTIVE JAM"). */
  overline: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.inkMuted },
  /** Big numbers (BPM, timers). */
  metric: { fontSize: 40, fontWeight: "700", letterSpacing: -1, color: colors.ink, fontVariant: ["tabular-nums"] as TextStyle["fontVariant"] },
} as const;

export const shadow = {
  card: {
    shadowColor: palette.burgundyDark,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: palette.burgundyDark,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
} as const;

/** Background/foreground pairs for tinted cards and badges. */
export const tones = {
  neutral: { bg: colors.blushSoft, fg: colors.brand },
  brand: { bg: colors.blush, fg: colors.brand },
  lavender: { bg: colors.lavender, fg: colors.lavenderInk },
  sage: { bg: colors.sage, fg: colors.ok },
  ok: { bg: colors.okSoft, fg: colors.ok },
  amber: { bg: colors.amberSoft, fg: colors.amberInk },
  escalation: { bg: colors.escalationSoft, fg: colors.escalation },
} as const;
export type Tone = keyof typeof tones;

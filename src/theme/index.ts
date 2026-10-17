/**
 * Design tokens. P2 owns the visual design and may tune VALUES; keep the NAMES stable so
 * P3/P4/P5 can use them: `colors.navy`, `space(4)`, `radius.card`, `type.title`, ...
 * Red (`colors.escalation`) is reserved for confirmed escalation only.
 */
export const colors = {
  navy: "#1f3a5f",
  navySoft: "#3b5a80",
  warmWhite: "#fbf8f3",
  surface: "#ffffff",
  sky: "#dcebf7",
  skyStrong: "#8fbde3",
  amber: "#e0a030",
  amberSoft: "#fdf1d8",
  escalation: "#c2413a",
  escalationSoft: "#f7e2e0",
  ok: "#2f8a5b",
  okSoft: "#e2f0e8",
  ink: "#1d2733",
  inkMuted: "#5a6675",
  inkFaint: "#97a1ad",
  border: "#e7e2d9",
  overlay: "rgba(29, 39, 51, 0.45)",
} as const;

/** 4-point spacing scale: space(4) === 16. */
export const space = (steps: number) => steps * 4;

export const radius = { sm: 10, card: 20, pill: 999 } as const;

/** Minimum comfortable tap target (iOS HIG 44pt, Material 48dp). */
export const TAP_TARGET = 48;

export const type = {
  display: { fontSize: 34, fontWeight: "700", color: colors.navy },
  title: { fontSize: 22, fontWeight: "700", color: colors.navy },
  heading: { fontSize: 17, fontWeight: "600", color: colors.navy },
  body: { fontSize: 16, color: colors.ink },
  bodyMuted: { fontSize: 16, color: colors.inkMuted },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  caption: { fontSize: 13, color: colors.inkMuted },
} as const;

export const shadow = {
  card: {
    shadowColor: "#1f3a5f",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

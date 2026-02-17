/**
 * Shared theme constants matching the website's design system.
 */
export const colors = {
  background: "#F4F3EE",
  foreground: "#140E1C",
  card: "#FFFFFF",
  cardBorder: "rgba(0, 0, 0, 0.06)",
  muted: "#EAE1DA",
  mutedForeground: "#6A6D78",
  success: "#2D6A4F",
  warning: "#E09F3E",
  danger: "#9B2226",
  info: "#457B9D",
  secondary: "#DEDEE3",
  accent: "#DEDEE3",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const fonts = {
  regular: { fontSize: 14, color: colors.foreground },
  small: { fontSize: 12, color: colors.mutedForeground },
  heading: { fontSize: 20, fontWeight: "700" as const, color: colors.foreground },
  subheading: { fontSize: 16, fontWeight: "600" as const, color: colors.foreground },
  mono: { fontSize: 12, fontFamily: "monospace", color: colors.foreground },
} as const;

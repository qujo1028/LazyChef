// Olive and paprika palette from docs/app-design.md. Contrast ratios are WCAG 2.x, measured
// against the screen background unless noted.
export type ColorTokens = {
  background: string;
  surface: string;
  /** Slightly deeper fill for pressed surfaces and list rows. */
  surfacePressed: string;
  ink: string;
  muted: string;
  /** Disabled text. Intentionally below 4.5:1; never the only carrier of information. */
  disabledText: string;
  divider: string;
  outline: string;
  primary: string;
  primaryPressed: string;
  primaryDisabled: string;
  onPrimary: string;
  accent: string;
  accentPressed: string;
  onAccent: string;
  pill: string;
  onPill: string;
  /** Tint for the active tab icon and label. */
  tabActive: string;
  tabInactive: string;
  danger: string;
  scrim: string;
};

// Light. Measured on cream #F8F6EC: ink 14.21, primary 6.81, muted 5.01 (5.43 on white),
// accent 4.58, outline 3.42 (3.70 on white). White on primary 7.38. Ink on pill 12.59.
export const lightColors: ColorTokens = {
  background: '#F8F6EC',
  surface: '#FFFFFF',
  surfacePressed: '#EFEBDA',
  ink: '#2A2418',
  muted: '#6E6A58',
  disabledText: '#9B977F',
  divider: '#D8D2BF',
  outline: '#8C8569',
  primary: '#4D5B2A',
  primaryPressed: '#3C4720',
  primaryDisabled: '#B5BC9C',
  onPrimary: '#FFFFFF',
  accent: '#C0492F',
  accentPressed: '#9E3A24',
  onAccent: '#FFFFFF',
  pill: '#E7EAD9',
  onPill: '#2A2418',
  tabActive: '#4D5B2A',
  tabInactive: '#6E6A58',
  danger: '#B3261E',
  scrim: 'rgba(42, 36, 24, 0.4)',
};

// Dark, derived from the same hues. Measured on background #1B1A12 (surface #272519 in brackets):
// ink 15.13 [13.34], muted 7.06 [6.23], primary 8.20 [7.23], accent 6.09 [5.37],
// outline 4.36 [3.85] (needs 3:1), onPrimary (#1B1A12 on #A7BA68) 8.20,
// onAccent (#1B1A12 on #E8795F) 6.09, ink on pill (#34371F) 10.63.
// Primary is lighter in dark mode so it reads on the dark ground, so buttons use dark text on it.
export const darkColors: ColorTokens = {
  background: '#1B1A12',
  surface: '#272519',
  surfacePressed: '#322F20',
  ink: '#F3EFDD',
  muted: '#ABA58D',
  disabledText: '#7A765F',
  divider: '#3A3727',
  outline: '#85805F',
  primary: '#A7BA68',
  primaryPressed: '#8FA350',
  primaryDisabled: '#4A5030',
  onPrimary: '#1B1A12',
  accent: '#E8795F',
  accentPressed: '#D2634A',
  onAccent: '#1B1A12',
  pill: '#34371F',
  onPill: '#F3EFDD',
  tabActive: '#A7BA68',
  tabInactive: '#ABA58D',
  danger: '#F2B8B5',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

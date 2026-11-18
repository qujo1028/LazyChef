import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ColorTokens } from './colors';
import { fonts, MIN_TOUCH, radius, spacing, type } from './tokens';

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  radius: typeof radius;
  spacing: typeof spacing;
  type: typeof type;
  fonts: typeof fonts;
  minTouch: number;
};

const base = { radius, spacing, type, fonts, minTouch: MIN_TOUCH };
const light: Theme = { scheme: 'light', colors: lightColors, ...base };
const dark: Theme = { scheme: 'dark', colors: darkColors, ...base };

/** Follows the system colour scheme. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export { darkColors, fonts, lightColors, MIN_TOUCH, radius, spacing, type };
export type { ColorTokens };

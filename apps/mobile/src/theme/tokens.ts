export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Minimum touch target in points (Apple HIG 44). */
export const MIN_TOUCH = 44;

export const fonts = {
  display: 'LibreCaslonDisplay_400Regular',
  regular: 'SourceSans3_400Regular',
  medium: 'SourceSans3_500Medium',
  semibold: 'SourceSans3_600SemiBold',
  bold: 'SourceSans3_700Bold',
} as const;

// Nothing below 11. Sizes scale with Dynamic Type; do not set allowFontScaling={false}.
export const type = {
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38 },
  titleSmall: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodySmall: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  recipeTitle: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
  meta: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  tabLabel: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
} as const;

# App design brief (LazyChef, inspired by Mealvana)

Status: brief received and direction set (2026-11-18). Not yet built. Target is the React Native (Expo) app in [react-native-app.md](react-native-app.md). Scope decisions are in [product-scope.md](product-scope.md).

Direction: borrow ideas from Mealvana's UI design only, and fit them to LazyChef's own identity. No Mealvana features or functions are part of this. That includes meal planning, date-based plans, the shuffle feature, and serving planners. Don't copy Mealvana's palette, logos, icons, photos, or layouts.

Source: the "LazyChef UI Redesign" prompt. It refers to Mealvana screenshots, but none have been shared yet, so visual details below come from the written brief only.

## Conflicts to resolve before building

1. **Platform.** The prompt describes the web app in an Xcode wrapper and says not to rebuild. The RN plan replaces that shell. Treat this doc as the design spec for the Expo app. Section 9 of the prompt (viewport, `env(safe-area-*)`, keyboard jumps) is for the web app only. The RN equivalents are the safe-area context, `KeyboardAvoidingView`, and the tab bar's bottom inset.
2. **Tab count.** The brief says four destinations. The scope has five (Pantry, Recipes, List, Activity, Household). Pick one before the nav is built.

## Palette: Olive and paprika (chosen 2026-11-18)

This replaces the app's current sage-and-tomato look. The OKLCH tokens in `src/app/globals.css` are the web app's values, and they stay until the web app is retired. The RN theme uses the values below. Hex values are starting points, measured against the cream background `#F8F6EC`. Tune them when the theme is written, then re-measure.

| Role | Hex | Contrast on cream | Use |
|---|---|---|---|
| Background | `#F8F6EC` | base | screen background |
| Surface | `#FFFFFF` | n/a | cards, sheets, inputs |
| Primary (olive) | `#4D5B2A` | 6.8:1 | save and main actions, active tab |
| Accent (paprika) | `#C0492F` | 4.6:1 | favourite hearts, badges, active highlights; passes for text |
| Ink | `#2A2418` | 14.2:1 | headings and body text |
| Muted text | to measure | to measure | metadata and secondary labels |
| Border | to choose | decorative | outlines, dividers |
| Pill | to choose | n/a | metadata capsules |

Contrast rules that follow from the numbers:
- Ink on cream or white for body text.
- Olive works for text and buttons. White text on olive passes (7.4:1).
- Paprika passes for text on cream (4.6:1). White text on paprika (5.0:1) also passes, but check it at the final hex.
- Muted text, border, and pill colours aren't measured yet. Measure them when the theme is written, before they're used for any text.

Radius and spacing: use the brief's scale (8, 14, 20, pill; spacing 4 to 32), mapped to a theme object in `packages/core` or the Expo theme.

## Typography (chosen 2026-11-18)

- **Display (titles):** Libre Caslon Display. Screen titles 28 to 32px. Use it only for titles and the largest headings.
- **UI (everything else):** Source Sans 3. Section headings 17 to 19px, body 14 to 16px, recipe titles 12 to 14px, metadata 11 to 12px, tab labels 10 to 11px.
- Both are Google Fonts under the SIL Open Font License, so they can be used in the app. Load them with `expo-font` in the RN app.
- **Accessibility:** 10 to 11px tab labels and metadata are small for many iOS users. Support Dynamic Type and keep the minimum at 11px where possible.
- Primary text uses the ink colour, not pure black.

## Screens

| Brief screen | Maps to | Notes |
|---|---|---|
| Recipe discovery (circles, carousels, see all) | Recipes tab | Visual pattern only: circular images, horizontal carousels, favourite hearts. Replaces the card grid. Ideas / Saved / Ours tabs stay as the filter. |
| Recipe editing (rounded images, stepper, save button) | Recipe edit sheet | Visual pattern only, applied to LazyChef's existing add and edit recipe form. |
| Bottom navigation | Tab bar | Five tabs, pending conflict 2. Olive active state, muted inactive. |

Screens outside the brief still use the same tokens and components: Pantry, List, Activity, Household, sign-in, and onboarding.

## Components

Names are for the Expo app, under `apps/mobile/components`.

- `AppScreenHeader`, `MetadataPill`, `CircleIconButton`
- `RecipeCircleCard`, `RecipeRectangleCard`, `RecipeCarousel`, `RecipeSectionHeader`
- `FavoriteButton` (paprika heart, small scale pulse)
- `SelectedRecipeIndicator`
- `ServingStepper` (for recipe servings, which LazyChef already tracks)
- `PrimaryPillButton` (olive, pill, white text)
- `BottomTabBar`

Before building, check the existing shared components in `src/components/ui` (shadcn). Reuse them in RN where the behaviour matches. Don't duplicate them.

## Motion

- Transitions 150 to 240ms.
- Light scale feedback on buttons.
- Heart pulse on favourite.
- Smooth carousel scrolling.
- Respect reduce-motion (`AccessibilityInfo.isReduceMotionEnabled` in RN).

## Behaviour and haptics

The haptic and reward rules from the habit plan (PR #62) apply to the same actions, mainly "I cooked this." Those rules are the source of truth for haptics. This brief adds visual feedback only.

## Checks before a screen counts as done

- Matches the palette, contrast rules, and type scale above.
- Checked at 375px and at the largest Dynamic Type size.
- The tab bar doesn't cover scrolling content (bottom inset applied).
- With reduce-motion on, no non-essential motion.
- Checked on a real phone for thumb reach and carousel scrolling (see the testing rules in the plan).

## Open questions

- Tab count: five (recommended) or four?
- Screenshots: share them so spacing and type can be checked against the references.
- Muted text, border, and pill colours: to measure and choose when the theme is written.

## Design iteration rules

- One card style across the whole app. Don't mix outlined and filled cards on different pages.
- Monochrome icons, tinted with the palette, so they match the colours.
- Generate the full colour ramp (shades for pressed, disabled, and muted states) from the chosen palette, then apply it everywhere.
- Check the status bar on the real phone. Icons that are white on a white background only show up on a device.
- Screenshot every screen, list the problems, then fix them and screenshot again.

# App design brief (LazyChef, inspired by Mealvana)

Status: brief received and direction set (2026-11-18). Not yet built. Target is the React Native (Expo) app in [react-native-app.md](react-native-app.md). Scope decisions are in [product-scope.md](product-scope.md).

Direction: take Mealvana's design principles, and fit them to LazyChef's own identity. Don't copy Mealvana's palette, logos, icons, photos, or layouts.

Source: the "LazyChef UI Redesign" prompt. It refers to Mealvana screenshots, but none have been shared yet, so visual details below come from the written brief only.

## Conflicts to resolve before building

1. **Platform.** The prompt describes the web app in an Xcode wrapper and says not to rebuild. The RN plan replaces that shell. Treat this doc as the design spec for the Expo app. Section 9 of the prompt (viewport, `env(safe-area-*)`, keyboard jumps) is for the web app only. The RN equivalents are the safe-area context, `KeyboardAvoidingView`, and the tab bar's bottom inset.
2. **Meal planning is a new feature.** Nothing in `product-scope.md` covers it. Options: (a) leave it out of v1 and map Recipes to the discovery layout; (b) add a planner as a later phase after launch. Recommendation: (a).
3. **Tab count.** The brief says four destinations. The scope has five (Pantry, Recipes, List, Activity, Household). Pick one before the nav is built.

## Palette: LazyChef first

LazyChef's existing tokens (in `src/app/globals.css`, OKLCH) are the base. The brief's principles map onto them:

| Role | LazyChef token | Value | Use |
|---|---|---|---|
| Background | `--background` | `oklch(0.982 0.009 85)` (warm cream) | screen background |
| Surface | `--card` | `oklch(0.997 0.004 85)` | cards, sheets |
| Primary | `--primary` | `oklch(0.5 0.11 150)` (sage green) | save and main actions, active tab |
| Accent | `--tomato` | `oklch(0.62 0.18 35)` | favourite hearts, badges, active highlights |
| Text | `--foreground` | `oklch(0.23 0.018 55)` (warm ink) | headings, body |
| Muted text | `--muted-foreground` | `oklch(0.51 0.02 65)` | metadata |
| Border | `--border` | `oklch(0.905 0.016 80)` | outlines, dividers |
| Pill | `--secondary` | `oklch(0.95 0.014 80)` | metadata capsules |

Why this and not the brief's navy and coral: LazyChef already has a cream background, a green primary, and a tomato accent. Swapping them for navy and coral would make the app look like a different product. The brief's *principles* (cream, outlined controls, circular imagery, pill metadata, editorial headings) carry over without changing the palette.

Contrast rules to check in the build (values are estimates, measure them when the theme is written):
- Body text uses `--foreground` on the cream or card backgrounds. It should pass easily.
- The sage primary works for text on the cream background. Measure before using it for small text.
- The tomato accent is probably around 3:1 on cream. That's fine for icons, hearts, and badges, but not for small text.
- Don't put white text on tomato. Use the dark foreground colour on tomato buttons.
- Muted text is for metadata and secondary labels. Measure it against the card background.

Decision for you: keep sage as the primary (recommended), or move to a deeper navy-leaning primary? Either way the other tokens stay.

Radius and spacing: LazyChef's `--radius` is 0.75rem. Use the brief's scale (8, 14, 20, pill; spacing 4 to 32), mapped to a theme object in `packages/core` or the Expo theme, not CSS variables.

## Typography

- Screen titles 28 to 32px, editorial and bold. One display face for titles only. Check the licence before shipping. Google Fonts are fine.
- Section headings 17 to 19px.
- Body 14 to 16px. Recipe titles 12 to 14px. Metadata 11 to 12px. Tab labels 10 to 11px.
- **Accessibility:** 10 to 11px tab labels and metadata are small for many iOS users. Support Dynamic Type and keep the minimum at 11px where possible.
- Primary text uses the warm foreground colour, not pure black.

## Screens

| Brief screen | Maps to | Notes |
|---|---|---|
| Recipe discovery (circles, carousels, see all) | Recipes tab | Circular images, horizontal carousels, favourite hearts. Replaces the card grid. Ideas / Saved / Ours tabs stay as the filter. |
| Meal planning | Not in v1 | See conflict 2. |
| Meal selection and editing | Recipe edit sheet, plus the cook flow | Rounded rectangle images, serving stepper, and the save button apply here. |
| Bottom navigation | Tab bar | Five tabs, pending conflict 3. Sage active state, muted inactive. |

Screens outside the brief still use the same tokens and components: Pantry, List, Activity, Household, sign-in, and onboarding.

## Components

Names are for the Expo app, under `apps/mobile/components`.

- `AppScreenHeader`, `MetadataPill`, `CircleIconButton`
- `RecipeCircleCard`, `RecipeRectangleCard`, `RecipeCarousel`, `RecipeSectionHeader`
- `FavoriteButton` (tomato heart, small scale pulse)
- `SelectedRecipeIndicator`
- `ServingStepper`
- `PrimaryPillButton` (primary colour, pill, text in the card colour)
- `BottomTabBar`
- Only if a planner is added later: `OutlinedDateSelector`, `MealSection`, `ShuffleButton`

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

- Primary colour: keep sage (recommended), or move to a deeper navy-leaning shade?
- Meal planner: v1 or later? (Recommendation: later.)
- Tab count: five (recommended) or four?
- Display font for titles: which one?
- Screenshots: share them so spacing and type can be checked against the references.

# App design brief (Mealvana-inspired)

Status: brief received, not yet built. Target is the React Native (Expo) app in [react-native-app.md](react-native-app.md). Scope decisions are in [product-scope.md](product-scope.md).

Source: the "LazyChef UI Redesign" prompt. It refers to supplied Mealvana screenshots, but none have been shared yet, so the visual details below are from the written brief only.

## Conflicts to resolve before building

1. **Platform.** The prompt describes the web app in an Xcode wrapper and says not to rebuild. The RN plan replaces that shell. Treat the design as the spec for the Expo app. Section 9 of the prompt (viewport, `env(safe-area-*)`, keyboard jumps) applies to the web app only. The RN equivalents are the safe-area context, `KeyboardAvoidingView`, and the tab bar's bottom inset.
2. **Meal planning is a new feature.** Nothing in `product-scope.md` covers it. Building it means a scope change, which the scope doc says to make in that file first. Options: (a) leave it out of v1 and map Recipes to the discovery layout; (b) add a meal planner as a later phase after launch. The current recommendation is (a), since the consumer review cut features that don't serve the core loop.
3. **Tab count.** The brief says four destinations. The scope has five (Pantry, Recipes, List, Activity, Household). Pick one before the nav is built.
4. **Screenshots.** Share them so the spacing, colour, and type can be checked against the real references. The brief says not to copy exact fonts or tokens, so these are starting points.
5. **Reference, not a copy.** Mealvana is a real product. Take the principles (warm cream, navy, coral, circular imagery, outlined controls). Don't copy its logos, icons, photos, or exact layouts.

## Tokens

Starting values from the brief, with a contrast check (WCAG, text on the background it sits on):

| Token | Value | Use | Contrast check |
|---|---|---|---|
| background | `#F8F6EC` | screen background | base |
| surface | `#FFFFFF` | sheets, inputs | base |
| primary (navy) | `#071F70` | headings, body text, save button, tab bar | about 13:1 on background. Passes. |
| secondary blue | `#3764C4` | links, outlined controls | about 5:1 on background. Passes for text. |
| border blue | `#7593D9` | outlines, dividers | decorative only |
| pill | `#DCE5F2` | metadata capsules | navy text on pill passes |
| muted | `#91A2D1` | inactive tab icons and labels | about 5.7:1 on navy. Passes on the tab bar. Fails on cream, so don't use it for text on the background. |
| accent | `#F5A49F` | soft highlights | about 1.8:1 on cream. **Fails for text.** Decorative only. |
| accent strong | `#FF7776` | hearts, badges, active icon background | about 5.7:1 as text on navy. White text on it is about 2.6:1, which **fails**. Use navy text on coral buttons, not white. |

Rules that follow from this:
- Navy text on cream or white only.
- Coral is for icons, hearts, badges, and active states, not body text.
- Don't put white text on coral.
- Muted blue is for the inactive tab bar only.

Radius and spacing: use the brief's values (8, 14, 20, pill; 4 to 32 spacing). These map to a theme object in `packages/core` or the Expo theme, not to CSS variables.

## Typography

- Screen titles 28 to 32px, editorial and bold. Pick one display face for titles only. Check the licence before shipping (Google Fonts are fine).
- Section headings 17 to 19px.
- Body 14 to 16px. Recipe titles 12 to 14px. Metadata 11 to 12px. Tab labels 10 to 11px.
- **Accessibility:** 10 to 11px tab labels and metadata are below what most iOS users read comfortably. Use Dynamic Type (`allowFontScaling`) and keep the minimum at 11px where possible.
- Primary text is navy, not black.

## Screens

| Brief screen | Maps to | Notes |
|---|---|---|
| Recipe discovery (circles, carousels, see all) | Recipes tab | Circular images, horizontal carousels, favourite hearts. Replaces the current card grid. Ideas / Saved / Ours tabs stay as the filter. |
| Meal planning | Not in v1 | See conflict 2. |
| Meal selection and editing | Recipe edit sheet, plus the cook flow | Rounded rectangle images, serving stepper, and the save button apply here. The shuffle button only makes sense if there's a planner. |
| Bottom navigation | Tab bar | Five tabs, pending conflict 3. Coral active circle, muted inactive. |

Screens that aren't in the brief still need the same tokens and components: Pantry, List, Activity, Household, sign-in, and onboarding.

## Components

These follow the brief's list. Names are for the Expo app, under `apps/mobile/components`.

- `AppScreenHeader`, `MetadataPill`, `CircleIconButton`
- `OutlinedDateSelector` (only if there's a date-based screen)
- `RecipeCircleCard`, `RecipeRectangleCard`, `RecipeCarousel`, `RecipeSectionHeader`
- `FavoriteButton` (coral heart, small scale pulse)
- `SelectedRecipeIndicator`
- `MealSection` (only with the planner)
- `ServingStepper`, `ShuffleButton` (only with the planner)
- `PrimaryPillButton` (navy, pill, text in cream)
- `BottomTabBar`

Before building, check the existing shared components in `src/components/ui` (shadcn) and reuse them in RN where the behaviour matches. Don't duplicate them.

## Motion

- Transitions 150 to 240ms.
- Light scale feedback on buttons.
- Heart pulse on favourite.
- Smooth carousel scrolling.
- Respect the reduce-motion setting (`AccessibilityInfo.isReduceMotionEnabled` in RN).

## Behaviour and haptics

The haptic and reward rules from the habit plan (PR #62) apply to the same actions here, mainly "I cooked this." Those rules are the source of truth for haptics. This brief only adds visual feedback.

## Checks before a screen counts as done

- Matches the tokens and contrast rules above.
- Checked at 375px and at the largest Dynamic Type size.
- Tab bar doesn't cover scrolling content (bottom inset applied).
- Reduce-motion turned on: no non-essential motion.
- Checked on a real phone for thumb reach and carousel scrolling (see the testing rules in the plan).

## Open questions

- Screenshots: can you share them?
- Meal planner: in v1 or later?
- Tab count: five (recommended) or four?
- Display font: which one?

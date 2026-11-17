# First-run experience: spec

Status: approved in interview 2026-11-09. Figma: https://www.figma.com/design/dKJO4N147wzyt4z3SZP5uM

## Goal
A brand-new visitor learns what LazyChef does in four swipeable cards. They answer three quick,
skippable preference questions and finish at sign-up. Their answers are saved to their account
and change recipe results straight away.

## Who sees it
- Signed-out visitors to `/` without the `lc_tour` cookie go to `/welcome`. This includes the iOS
  app's first launch. With the cookie they go to `/login`, as they do today.
- `/login` and `/signup` stay reachable directly. Signed-in users never see the tour.
- Invite links (`/join/[code]`) skip the tour and go straight to sign-up and joining, as they do today.
- The `lc_tour` cookie is set (1 year) once someone leaves the tour, whether they finish it, skip
  it or tap "I have an account".

## Flow (`/welcome`, one client page with steps in `?step=` so Back and refresh work)
| # | Screen | Content |
|---|--------|---------|
| 1 | Shared pantry | Logo. "One pantry for your whole household". Everyone you live with sees the same shelves, live. |
| 2 | Add in seconds | Scan a barcode or quick-add; set expiry dates so nothing goes off unseen. |
| 3 | Shared list | One shopping list; tick items off and they move into the pantry. |
| 4 | What can I cook | Recipes ranked by what you have; cook mode walks you through and uses up ingredients. |
| 5 | Diet + allergies | Diet (single choice): No restrictions, Vegetarian, Vegan, Pescatarian. Allergies (multi): Dairy, Egg, Gluten, Peanut, Tree nut, Fish, Shellfish, Soy, Sesame. |
| 6 | Cuisines | Multi: American, British, Italian, Mexican, Chinese, Japanese, Thai, Indian, French, Spanish, Greek, plus an "I'm adventurous: show world recipes" switch. |
| 7 | Starter staples | Tap to add: salt, black pepper, olive oil, vegetable oil, sugar, flour, butter, garlic, rice, pasta, eggs, onions. |
| 8 | Sign-up | The existing sign-up form (email; Google when it's enabled) plus a line confirming "Your preferences will be saved". States: default, error, loading. |

- Cards 1–4 show progress dots. Steps 5–7 show "Step n of 3". Each screen has Back, Next (or
  "Continue"), "Skip" (goes to sign-up and keeps answers so far) and "I have an account" (goes to `/login`).
- Swipe, arrow keys and buttons all move between cards. Motion respects `prefers-reduced-motion`.
- Controls are at least 44 px tall, with safe-area padding at the top and bottom.

## Storage
- Before sign-up, answers are kept in `localStorage` (`lazychef:first-run`).
- After sign-up or sign-in, a client effect calls `savePreferences()`, then clears the stored answers.
- The new table `public.user_preferences` holds `user_id` (primary key, references the profile),
  `diet` (text check), `allergies` (text[]), `cuisines` (text[]), `world_recipes` (bool) and
  `updated_at`. RLS limits each row to its own user (`user_id = auth.uid()`). Writes go through
  `security definer` `public.set_my_preferences(...)`. Includes a test in `supabase/tests`.
- Staples wait in `localStorage` until the user has a household. The first pantry load then runs the
  existing `addStaples` action and clears them.

## Effect on recipes
- Diet and allergies hide conflicting recipes from the built-in library, matched on ingredients.
- Spoonacular calls that already run pass `diet` and `intolerances`. This adds no calls. For
  someone with a diet or allergy, the plain "find by ingredients" call becomes a filtered search.
  That is still one call, at about 2.2 points instead of 1.4, cached for an hour. Results are
  also checked against ingredient names.
- Liked cuisines rank higher in Ideas. `world_recipes` sets the default for the "Include world
  recipes" switch.
- A "Show all recipes" toggle on the recipes page ignores diet and allergies for that view.

## Editing later
The "You" card on `/household` gets a "Food preferences" row. It opens a sheet with diet,
allergies, cuisines and the world switch.

## After sign-up
Sign-up leads to `/onboarding`, the existing create-or-join household screen restyled to match.
`next` and the pending-invite cookie keep working as they do today.

## Not in scope
Install prompts, cooking skill/time, household size, and per-household preferences.

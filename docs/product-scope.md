# Product scope

What the app should do, based on a consumer review of the current web app (2026-11-18). Both the web app and the React Native app build against this file. When a decision changes, update this file first.

## Keep

- **Four-tab navigation:** Pantry, Recipes, List, Activity. Plain labels, clear active state, safe-area spacing.
- **Shared household with live updates.** Invites, members, and changes showing up for everyone. This is the core value.
- **Fast pantry entry.** Quick-add with autocomplete, "Used some," Undo on −1, staples.
- **Recipes that check the pantry.** "Make now" vs. "almost there (1 to 3 missing)," and "add missing to list."
- **Offline fallback** instead of a blank screen when there's no signal.

## Redo

- **One way to add food.** A quick-add sheet with an "Add several" option. The separate `/pantry/add` page goes away.
- **Recipe quota.** The Spoonacular free tier is 50 points a day, shared by the household. Show remaining searches and when they reset. Serve cached results first. Never show a silent dead end.
- **One "Ideas" entry point** for all AI features (pantry, barcodes, recipe ideas, substitutions).
- **Household page** handles household settings only. Account settings get their own screen.
- **Simpler header:** household name only. The avatar moves into account settings.
- **Free AI limit (10 uses a week):** show the count before the limit is reached.

## Cut from v1

- **Substitutions.** Adds a feature without solving the core job.
- **Activity stats subpage.** Keep the activity feed.
- **Separate recipe pages** ("Ours," "Saved," "New"). Merge into one recipes screen with filters: Mine, Saved, Suggested.
- **Full Pro page.** Use a soft prompt only until people use the app weekly.
- **Developer and build text in the UI.** Legal and support pages are the only text beyond the app itself.

## Priorities

1. Fix the recipe quota experience. It's the most likely reason someone stops using the app.
2. Consolidate the add-food flow and the recipe lists.
3. Cut substitutions, the stats page, and the early Pro page from v1.

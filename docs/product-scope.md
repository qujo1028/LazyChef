# Product scope

What the app should do, based on a consumer review of the current web app (2026-11-18). Both the web app and the React Native app build against this file. When a decision changes, update this file first.

## Keep

- **Tab navigation:** Pantry, Recipes, List, Activity, and Household (five tabs, pending the decision in the plan; the web app has four tabs today, with Household in the header). Plain labels, clear active state, safe-area spacing.
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

## Design framework

Every feature is checked against five parts, in order. The app needs all five to work.

1. **Core function:** the pantry knows what's in the house and suggests what to cook from it.
2. **Core loop:** an action with a reward within about 30 seconds. "I cooked this" is the action. The reward is haptic on every cook; confetti and a stronger haptic on milestones. The weekly ring and streak update right away.
3. **Accessory features:** Activity log, chart, and board; household leaderboard; personal goals; challenges. These support the loop and don't change it.
4. **Surface area:** 5 to 7 screens. Five tabs plus recipe detail. Onboarding is a single pass.
5. **Retention hook:** a reason to come back. The weekly ring and the "This week" card on Pantry, a rotating challenge (for example, "Cook 3 days in a row"), and a push when food is about to expire. The app shouldn't claim people will use it once.

Work through these five before any coding, so the scope can be handed to Claude as a spec.

## Onboarding

- One pass through. Ask only what the app needs to be useful: household name, invite or create, and the first pantry items.
- Notification permission is asked at the first reminder the user sets, not at launch.

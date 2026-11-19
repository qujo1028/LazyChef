# Product scope

What the app should do, based on a consumer review of the current web app (2026-11-18). Both the web app and the React Native app build against this file. When a decision changes, update this file first.

## Keep

- **Tab navigation:** in the Expo app, five bottom tabs (Pantry, Recipes, Home, List, Household), with Home as a raised round button in the center, and the app opens on Home (decided 2026-11-18). The web app keeps its four tabs (Pantry, Recipes, List, Household). Activity is a header icon, top right. Plain labels, clear active state, safe-area spacing.
- **Home tab** (Expo app, decided 2026-11-18): a greeting with the household name and an expiring-soon line (only when something expires in the next 7 days; it opens Pantry), the "This week" card (moved here from Pantry), a compact household board ("See all" opens Activity; the challenge stays on the This week card), and a row of trending recipes. Trending is the library recipes that at least 2 different households cooked in the last 7 days, ranked by how many households cooked them. It never shows household recipes or who cooked. Until enough households cook the same thing, random library picks (stable for the day) fill the row up to 10, tagged "Try something new".
- **Shared household with live updates.** Invites, members, and changes showing up for everyone. This is the core value.
- **Fast pantry entry.** Quick-add with autocomplete, "Used some," Undo on −1, staples.
- **Recipes that check the pantry.** "Make now" vs. "almost there (1 to 3 missing)," and "add missing to list."
- **Offline fallback** instead of a blank screen when there's no signal.

## Redo

- **One way to add food.** A quick-add sheet with an "Add several" option. The separate `/pantry/add` page goes away.
- **Recipe quota.** The Spoonacular free tier is 50 points a day, shared by the household. Show remaining searches and when they reset. Serve cached results first. Never show a silent dead end.
- **One "Ideas" entry point** for AI: a sparkle "Ideas" button in the Recipes header opens one sheet with recipe ideas from the pantry (pick a meal, an optional hint, up to 3 ideas, save one to Mine or add its missing items to the list). Decided 2026-11-18 for the Expo app: v1 has recipe ideas only. "Split with AI" in add food and "Tidy name with AI" on scans wait until after v1 (they are add-food helpers, and the core loop works without them).
- **Household page** handles household settings only. Account settings get their own screen.
- **Simpler header:** household name only. The avatar moves into account settings.
- **Free AI limit (10 uses a week):** show the count before the limit is reached.
- **Account settings screen** (P6, decided 2026-11-18): opened from the Household tab. The avatar is the sign-in photo when there is one, otherwise initials (no photo upload in v1). It also holds the display name, a personal weekly cook goal (1 to 7 nights, default 3, stored per person), food preferences, haptics, notifications, legal links, sign out and delete account.

## Cut from v1

- **Substitutions.** Adds a feature without solving the core job.
- **Scan to check off on the shopping list** (Expo app). Scanning adds to the pantry only in v1 (decided 2026-11-18).
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
4. **Surface area:** 5 to 7 screens. Five bottom tabs in the Expo app (four on the web), Activity from the header, recipe detail, and account settings. Onboarding is a single pass. With Home, the Expo app is at the top of this range: a new screen means cutting or merging one.
5. **Retention hook:** a reason to come back. The Home tab: the weekly ring and the "This week" card (on Pantry in the web app), a rotating challenge (for example, "Cook 3 days in a row"), trending recipes from other households, and a push when food is about to expire. The app shouldn't claim people will use it once.

Work through these five before any coding, so the scope can be handed to Claude as a spec.

## Onboarding

- One pass through. Ask only what the app needs to be useful: household name, invite or create, and the first pantry items.
- Notification permission is asked at the first reminder the user sets, not at launch.

## Parked ideas (not v1)

- **Daily coaching message:** a short generated nudge when the app opens, if there's been no message in the last 12 hours. It needs AI budget and is an accessory feature, so it waits until the core loop works on a phone.

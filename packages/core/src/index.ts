// Shared pure logic for the web and Expo apps, one folder per domain (units, ingredients,
// dates, pantry, list, recipes, habit, activity, auth, ...). No imports from next, react,
// react-dom or react-native; an ESLint rule in the root config enforces it.
//
// Import each module by its path, for example `@lazychef/core/units` or
// `@lazychef/core/habit/streak`. There is no barrel here, so an app only bundles what it uses.
export {}

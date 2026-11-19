// Dev only (__DEV__): fake answers so every state of the Ideas sheet can be previewed while the
// `ai` Edge Function isn't deployed. Never imported outside a __DEV__ branch.
import type { AiAllowance, AiFailure, AiIdea } from '@lazychef/core/ai/edge-contract';

export const DEV_ALLOWANCE: AiAllowance = { pro: false, used: 3, limit: 10, resetsAt: null };

export const DEV_LIMIT_FAILURE: AiFailure = {
  error: 'Used up.',
  code: 'limit_reached',
  allowance: { pro: false, used: 10, limit: 10, resetsAt: new Date(Date.now() + 3 * 86_400_000).toISOString() },
};

export const DEV_NOT_SET_UP: AiFailure = { error: "AI ideas aren't set up yet.", code: 'not_configured' };
export const DEV_RATE_LIMITED: AiFailure = { error: 'Slow down.', code: 'rate_limited' };
export const DEV_EMPTY_PANTRY: AiFailure = { error: 'Empty.', code: 'empty_pantry' };
export const DEV_UPSTREAM: AiFailure = { error: "Couldn't get ideas right now. Try again.", code: 'upstream' };

export const DEV_IDEAS: AiIdea[] = [
  {
    recipe: {
      title: 'Egg fried rice',
      description: 'A quick one-pan dinner from leftover rice.',
      servings: 2,
      minutes: 15,
      ingredients: [
        { name: 'cooked rice', amount: '2 cups', fromPantry: true },
        { name: 'eggs', amount: '2', fromPantry: true },
        { name: 'soy sauce', amount: '2 tbsp', fromPantry: true },
        { name: 'spring onions', amount: '2', fromPantry: false },
      ],
      steps: ['Heat a pan with a little oil.', 'Scramble the eggs and set aside.', 'Fry the rice, add soy sauce and the eggs.', 'Top with spring onions.'],
    },
    missing: ['spring onions'],
  },
  {
    recipe: {
      title: 'Tomato pasta',
      description: 'Simple and comforting.',
      servings: 2,
      minutes: 20,
      ingredients: [
        { name: 'pasta', amount: '200 g', fromPantry: true },
        { name: 'tinned tomatoes', amount: '1 can', fromPantry: true },
      ],
      steps: ['Boil the pasta.', 'Simmer the tomatoes with salt.', 'Toss together.'],
    },
    missing: [],
  },
  {
    recipe: {
      title: 'Cheese omelette',
      description: 'Ready in minutes.',
      servings: 1,
      minutes: 8,
      ingredients: [
        { name: 'eggs', amount: '3', fromPantry: true },
        { name: 'cheddar', amount: '40 g', fromPantry: false },
        { name: 'butter', amount: '1 tsp', fromPantry: false },
      ],
      steps: ['Beat the eggs.', 'Melt butter in a pan and pour in the eggs.', 'Add cheese, fold and serve.'],
    },
    missing: ['cheddar', 'butter'],
  },
];

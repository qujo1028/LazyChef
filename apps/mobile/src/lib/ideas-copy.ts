// Pure: the words and state mapping for the Ideas sheet. Ports of the web's meal ideas copy
// (mealPhrase) plus the count line and the AiFailure to screen mapping.
import { AI_IDEA_MEALS, type AiAllowance, type AiErrorCode, type AiFailure, type AiIdeaMeal } from '@lazychef/core/ai/edge-contract';
import { MEAL_IDEAS_SENDS } from '@lazychef/core/ai/idea-save';
import { limitMessage } from '@lazychef/core/pro/ai-allowance-core';
import { autoSlot } from '@lazychef/core/recipes/filters';

export { MEAL_IDEAS_SENDS };

const MEAL_LABELS: Record<AiIdeaMeal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  'main course': 'Dinner',
  'side dish': 'Sides',
  salad: 'Salad',
  soup: 'Soup',
  snack: 'Snack',
  dessert: 'Dessert',
  any: 'Any',
};

export const IDEA_MEAL_CHOICES: { value: AiIdeaMeal; label: string }[] = AI_IDEA_MEALS.map((value) => ({
  value,
  label: MEAL_LABELS[value],
}));

/** The meal to start on: by the viewer's clock like the web's Auto, or "any" before we know it. */
export function defaultIdeaMeal(hour: number | null): AiIdeaMeal {
  if (hour === null) return 'any';
  return autoSlot(hour).meals[0] ?? 'any';
}

/** "Get ideas for dinner". */
export function mealPhrase(meal: AiIdeaMeal): string {
  switch (meal) {
    case 'main course':
      return 'dinner';
    case 'side dish':
      return 'sides';
    case 'snack':
      return 'a snack';
    case 'any':
      return 'a meal';
    default:
      return meal;
  }
}

/** "7 of 10 free ideas left this week", or null for Pro (nothing to count). */
export function countLine(allowance: AiAllowance | null | undefined): string | null {
  if (!allowance || allowance.pro) return null;
  const left = Math.max(0, allowance.limit - allowance.used);
  if (left === 0) return `No free ideas left this week`;
  return `${left} of ${allowance.limit} free ${left === 1 ? 'idea' : 'ideas'} left this week`;
}

export type IdeasProblemKind = 'not_set_up' | 'offline' | 'rate_limited' | 'empty_pantry' | 'upstream' | 'limit';

export type IdeasProblem = {
  kind: IdeasProblemKind;
  title: string;
  message: string;
  /** Whether a "Try again" button makes sense. */
  retry: boolean;
};

function kindFor(code: AiErrorCode, offline: boolean): IdeasProblemKind {
  if (offline) return 'offline';
  switch (code) {
    case 'not_configured':
      return 'not_set_up';
    case 'limit_reached':
      return 'limit';
    case 'rate_limited':
      return 'rate_limited';
    case 'empty_pantry':
      return 'empty_pantry';
    default:
      return 'upstream';
  }
}

/** Maps a failure from callAi to what the sheet shows. `offline` wins: the app never reached the function. */
export function problemFor(failure: AiFailure, offline: boolean, now: Date = new Date()): IdeasProblem {
  const kind = kindFor(failure.code, offline);
  switch (kind) {
    case 'not_set_up':
      return { kind, title: "Ideas aren't ready", message: "AI ideas aren't set up yet.", retry: false };
    case 'offline':
      return { kind, title: "You're offline", message: 'Ideas need a connection. Try again when you are back online.', retry: true };
    case 'rate_limited':
      return {
        kind,
        title: 'Slow down a little',
        message: "You've asked for a lot of ideas this hour. Try again in a bit.",
        retry: false,
      };
    case 'empty_pantry':
      return {
        kind,
        title: 'Your pantry is empty',
        message: 'Add a few things to your pantry and ideas will appear here.',
        retry: false,
      };
    case 'limit':
      return { kind, title: 'No free ideas left', message: limitMessage(failure.allowance?.resetsAt ?? null, now), retry: false };
    default:
      return {
        kind,
        title: "Couldn't get ideas",
        message: failure.code === 'upstream' && failure.error ? failure.error : "Couldn't get ideas right now. Try again.",
        retry: true,
      };
  }
}

/** True when the free allowance is used up (so the button should explain instead of asking). */
export function limitReached(allowance: AiAllowance | null | undefined): boolean {
  return !!allowance && !allowance.pro && allowance.used >= allowance.limit;
}

const CONSENT_PREFIX = 'lazychef:ai-consent:v1';

/** Storage key for consent: tied to the wording, so rewording what is sent asks again. Same format as the web. */
export function consentKey(sends: string): string {
  return `${CONSENT_PREFIX}:${sends}`;
}

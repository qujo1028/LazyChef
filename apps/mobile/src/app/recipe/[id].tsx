import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { describeListAdditions } from '@lazychef/core/list/plan';
import { parseRecipeRef, SOURCE_LABELS } from '@lazychef/core/recipes/ref';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScreenHeader } from '@/components/AppScreenHeader';
import { Card } from '@/components/Card';
import { MetadataPill } from '@/components/MetadataPill';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useToast } from '@/components/Toast';
import { useHouseholdCooks } from '@/features/habit/use-habit';
import { addListItems } from '@/features/list/api';
import { useList } from '@/features/list/list-provider';
import { usePantry } from '@/features/pantry/pantry-provider';
import { CookSheet } from '@/features/recipes/components/CookSheet';
import { IngredientChecklist } from '@/features/recipes/components/IngredientChecklist';
import { RecipeSaveButton } from '@/features/recipes/components/RecipeSaveButton';
import { fetchRecipe, RecipeLoadError } from '@/features/recipes/recipe-api';
import { queryKeys, useActiveHousehold } from '@/lib/household';
import { buildChecklist, cookedLabelFor, listLinesFor, problemFor, type LoadProblem } from '@/lib/recipe-view';
import { deviceTimeZone } from '@/lib/time-zone';
import { useNow } from '@/lib/use-now';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme';

const SPOONACULAR_URL = 'https://spoonacular.com/food-api';
const THEMEALDB_URL = 'https://www.themealdb.com';
/** Spoonacular lookups cost points, so a loaded recipe stays fresh for a while. */
const RECIPE_STALE_MS = 10 * 60 * 1000;

/** One recipe: a Spoonacular id ("715538") or one of ours (a uuid). Opened with router.push(`/recipe/${ref}`). */
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ref = useMemo(() => parseRecipeRef(id), [id]);
  const router = useRouter();
  const { colors, spacing, type } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { household } = useActiveHousehold();
  const householdId = household?.id ?? null;
  const { items: pantryItems } = usePantry();
  const { items: listItems } = useList();
  const today = useToday();
  const now = useNow();
  const cooks = useHouseholdCooks(householdId);
  const [cookOpen, setCookOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.recipe(householdId ?? 'none', id ?? ''),
    enabled: ref !== null && householdId !== null,
    staleTime: RECIPE_STALE_MS,
    queryFn: () => fetchRecipe(householdId!, ref!),
  });
  const recipe = query.data;

  const checklist = useMemo(
    () =>
      recipe
        ? buildChecklist(
            recipe,
            [...pantryItems.values()],
            today,
            [...listItems.values()].filter((line) => line.checked_at === null),
          )
        : [],
    [recipe, pantryItems, listItems, today],
  );

  const header = (title: string) => (
    <Stack.Screen options={{ header: () => <AppScreenHeader title={title} onBack={() => router.back()} /> }} />
  );

  if (ref === null) return <Problem header={header('Recipe')} problem={problemFor('not_found')} />;
  if (!recipe) {
    if (query.isPending) {
      return (
        <View style={[styles.fill, { backgroundColor: colors.background, padding: spacing.lg }]}>
          {header('Recipe')}
          <Text accessibilityRole="progressbar" style={[type.body, { color: colors.muted }]}>
            Loading the recipe...
          </Text>
        </View>
      );
    }
    const code = query.error instanceof RecipeLoadError ? query.error.code : 'unknown';
    return <Problem header={header('Recipe')} problem={problemFor(code)} onRetry={code === 'not_found' ? undefined : () => void query.refetch()} />;
  }

  const cooked = cookedLabelFor(cooks.data, recipe.ref, now, deviceTimeZone());
  const meta: string[] = [];
  if (recipe.readyInMinutes) meta.push(`${recipe.readyInMinutes} min`);
  if (recipe.servings) meta.push(`Serves ${recipe.servings}`);
  const sourceLabel = recipe.aiGenerated && recipe.source === 'user' ? 'AI idea' : SOURCE_LABELS[recipe.source];
  const have = checklist.filter((line) => line.status !== 'need').length;

  async function addMissing(chosen: number[]) {
    if (!recipe || !householdId || addingRef.current) return;
    const lines = listLinesFor(recipe, chosen);
    if (lines.length === 0) return;
    addingRef.current = true;
    setAdding(true);
    const result = await addListItems(householdId, lines);
    addingRef.current = false;
    setAdding(false);
    if (result.error !== undefined) toast.show({ message: result.error, tone: 'error' });
    else toast.show({ message: `${describeListAdditions(result)} on the shopping list` });
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {header(recipe.title)}
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        {recipe.image ? (
          <Image
            source={{ uri: recipe.image }}
            contentFit="cover"
            transition={150}
            accessibilityLabel={recipe.title}
            style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 20, backgroundColor: colors.pill }}
          />
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <View style={[styles.titleRow, { gap: spacing.md }]}>
            <Text accessibilityRole="header" style={[type.titleSmall, styles.title, { color: colors.ink }]}>
              {recipe.title}
            </Text>
            {householdId ? (
              <RecipeSaveButton householdId={householdId} recipeRef={ref} title={recipe.title} image={recipe.source === 'spoonacular' ? recipe.image : null} />
            ) : null}
          </View>
          <View style={[styles.pills, { gap: spacing.sm }]}>
            <MetadataPill label={sourceLabel} />
            {meta.map((label) => (
              <MetadataPill key={label} label={label} />
            ))}
          </View>
          {cooked ? <Text style={[type.bodySmall, { color: colors.muted }]}>{cooked}</Text> : null}
          {query.isError ? (
            <Text style={[type.bodySmall, { color: colors.muted }]}>
              {query.error instanceof RecipeLoadError && query.error.code === 'offline'
                ? "You're offline. Showing the copy on this phone."
                : "Couldn't refresh this recipe. Showing the copy on this phone."}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
            Ingredients
            <Text style={[type.bodySmall, { color: colors.muted }]}>
              {'  '}you have {have} of {checklist.length}
            </Text>
          </Text>
          {checklist.length > 0 ? (
            <IngredientChecklist lines={checklist} adding={adding} onAdd={addMissing} />
          ) : (
            <Text style={[type.body, { color: colors.muted }]}>This recipe has no ingredient list.</Text>
          )}
        </View>

        {recipe.steps.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
              Steps
            </Text>
            <Card>
              {recipe.steps.map((step, i) => (
                <View key={i} style={[styles.step, { gap: spacing.md }]}>
                  <View style={[styles.stepNumber, { backgroundColor: colors.pill }]}>
                    <Text style={[type.meta, { color: colors.onPill }]}>{i + 1}</Text>
                  </View>
                  <Text style={[type.body, styles.stepText, { color: colors.ink }]}>{step}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          {recipe.sourceUrl ? (
            <PrimaryPillButton
              variant="outline"
              title={`${recipe.source === 'user' ? 'Original recipe' : 'Full recipe'}${recipe.sourceName ? ` on ${recipe.sourceName}` : ''}`}
              onPress={() => void WebBrowser.openBrowserAsync(recipe.sourceUrl!)}
            />
          ) : null}
          {recipe.source === 'spoonacular' ? (
            <Credit
              text={recipe.sourceName ? `Recipe by ${recipe.sourceName}. ` : ''}
              link="Powered by Spoonacular"
              url={SPOONACULAR_URL}
            />
          ) : recipe.source === 'themealdb' ? (
            <Credit text="Recipe data from " link="TheMealDB" url={recipe.creditUrl ?? THEMEALDB_URL} />
          ) : null}
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.md + insets.bottom,
          backgroundColor: colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.divider,
        }}
      >
        <PrimaryPillButton title="I cooked this" onPress={() => setCookOpen(true)} />
      </View>

      <CookSheet
        visible={cookOpen}
        onClose={() => setCookOpen(false)}
        recipe={{ ref: recipe.ref, title: recipe.title, ingredients: recipe.ingredients, servings: recipe.servings }}
      />
    </View>
  );
}

function Credit({ text, link, url }: { text: string; link: string; url: string }) {
  const { colors, type, minTouch } = useTheme();
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={`${text}${link}. Opens in the browser.`}
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      style={[type.bodySmall, styles.credit, { color: colors.muted, minHeight: minTouch, lineHeight: minTouch }]}
    >
      {text}
      <Text style={{ textDecorationLine: 'underline' }}>{link}</Text>
      <Ionicons name="open-outline" size={12} color={colors.muted} />
    </Text>
  );
}

/** Not found, not set up, resting, offline or an error: always a message, never a blank page. */
function Problem({ header, problem, onRetry }: { header: ReactNode; problem: LoadProblem; onRetry?: () => void }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg }]}>
      {header}
      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
          {problem.title}
        </Text>
        <Text style={[type.body, { color: colors.muted }]}>{problem.line}</Text>
      </View>
      {onRetry ? <PrimaryPillButton variant="outline" title="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { flex: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap' },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: -1 },
  stepText: { flex: 1 },
  credit: { textAlign: 'center' },
});

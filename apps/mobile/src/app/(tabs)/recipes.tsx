// Recipes tab: one screen with Suggested, Saved and Mine filters (docs/product-scope.md).
// Suggested ranks our own library against the live pantry and only tops up from Spoonacular
// when the library gives fewer than ten ideas. Creating and editing recipes is not here yet.
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, SectionList, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useToast } from '@/components/Toast';
import { getHouseholdRecipes } from '@/features/recipes/local';
import { usePantry } from '@/features/pantry/pantry-provider';
import { RecipeCard } from '@/features/recipes/components/RecipeCard';
import { SpoonacularCredit } from '@/features/recipes/components/SpoonacularCredit';
import { useSavedRecipes } from '@/features/recipes/saved';
import { useSuggestions } from '@/features/recipes/use-suggestions';
import { queryKeys } from '@/lib/household';
import { cardFromSaved, cardFromSuggestion, savedSummary, type RecipeCardData } from '@/lib/recipe-cards';
import { buildSaved, ideaSections, searchQuery } from '@/lib/recipe-ideas';
import { buildPantryIndex, type Suggestion } from '@lazychef/core/recipes/match';
import { localSuggestion } from '@lazychef/core/recipes/local-match';
import { sortSaved } from '@lazychef/core/recipes/saved';
import { useOffline } from '@/lib/use-offline';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme';

type Filter = 'suggested' | 'saved' | 'mine';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'suggested', label: 'Suggested' },
  { value: 'saved', label: 'Saved' },
  { value: 'mine', label: 'Mine' },
];

/** Waits for typing to pause before the search runs. */
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export default function RecipesScreen() {
  const { colors, spacing, type, radius, minTouch } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const offline = useOffline();
  const today = useToday();
  const { householdId, items } = usePantry();

  const [filter, setFilter] = useState<Filter>('suggested');
  const [text, setText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const search = searchQuery(useDebounced(text, 400));

  const suggestions = useSuggestions(search, filter === 'suggested');
  const saved = useSavedRecipes(householdId);
  const mine = useQuery({
    queryKey: queryKeys.recipes(householdId ?? 'none', 'mine'),
    enabled: householdId !== null && filter === 'mine',
    queryFn: () => getHouseholdRecipes(householdId!),
  });

  const index = useMemo(() => buildPantryIndex([...items.values()], today), [items, today]);

  const savedList = useMemo(
    () => sortSaved(buildSaved(saved.rows.data ?? [], saved.cards.data ?? [], index), 'ready'),
    [saved.rows.data, saved.cards.data, index],
  );
  const savedCards = useMemo(() => savedList.map(cardFromSaved), [savedList]);
  const mineCards = useMemo<RecipeCardData[]>(
    () =>
      (mine.data ?? []).map((card) => {
        const s: Suggestion = localSuggestion(index, card);
        return {
          id: card.id,
          source: card.source,
          title: card.title,
          image: card.image,
          readyInMinutes: card.readyInMinutes,
          match: { have: s.have.length, need: s.need },
          aiGenerated: card.aiGenerated,
        };
      }),
    [mine.data, index],
  );

  const open = useCallback((id: string) => router.push({ pathname: '/recipe/[id]', params: { id } }), [router]);
  const onToggleSaved = useCallback(
    (card: RecipeCardData) => saved.toggle(card.id, card.title, card.image, (message) => toast.error(message)),
    [saved, toast],
  );

  const refresh = async () => {
    // Offline, a refetch waits for the network, so don't leave the spinner up.
    if (offline) return;
    setRefreshing(true);
    try {
      await Promise.all([
        filter === 'suggested' ? suggestions.refetch() : filter === 'mine' ? mine.refetch() : Promise.resolve(),
        saved.rows.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />;

  const ideas = suggestions.ideas;
  const sections = useMemo(() => (ideas ? ideaSections(ideas, search !== null) : []), [ideas, search]);

  const header = (
    <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
          Recipes
        </Text>
        {filter === 'saved' ? <Text style={[type.body, { color: colors.muted }]}>{savedSummary(savedList)}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </View>
      {filter === 'suggested' ? (
        <>
          <TextInput
            accessibilityLabel="Search recipes"
            value={text}
            onChangeText={setText}
            placeholder="Search recipes by name"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[
              type.body,
              {
                minHeight: minTouch,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.outline,
                backgroundColor: colors.surface,
                color: colors.ink,
              },
            ]}
          />
          {suggestions.notice ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[type.bodySmall, { color: suggestions.notice.tone === 'note' ? colors.ink : colors.muted }]}
            >
              {suggestions.notice.text}
            </Text>
          ) : null}
          {suggestions.localFailed ? (
            <Text style={[type.bodySmall, { color: colors.muted }]}>Couldn&apos;t read your recipe library just now.</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const empty = (title: string, line: string, action?: ReactElement) => (
    <View
      style={{
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.xl,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.outline,
      }}
    >
      <Text style={[type.heading, { color: colors.ink, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{line}</Text>
      {action}
    </View>
  );

  const loading = (label: string) => (
    <View style={{ paddingTop: spacing.xl }}>
      <ActivityIndicator color={colors.primary} accessibilityLabel={label} />
    </View>
  );

  const retry = (message: string, onRetry: () => void) => (
    <View style={{ gap: spacing.md }}>
      <FormMessage tone="error" text={offline ? "You're offline and nothing is saved yet." : message} />
      <PrimaryPillButton title="Try again" onPress={onRetry} />
    </View>
  );

  const listProps = {
    keyboardShouldPersistTaps: 'handled' as const,
    keyboardDismissMode: 'on-drag' as const,
    contentInsetAdjustmentBehavior: 'never' as const,
    contentContainerStyle: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    refreshControl,
    ListHeaderComponent: header,
  };

  const isSaved = (id: string) => saved.refs.has(id);

  let body: ReactElement;
  if (filter === 'suggested') {
    let footer: ReactElement | null = null;
    let emptyView: ReactElement | null = null;
    if (suggestions.emptyPantry) {
      emptyView = empty('Your pantry is empty.', 'Add some food and ideas will show up here. You can still search the library above.');
    } else if (suggestions.isLoading) {
      emptyView = loading('Finding recipes');
    } else if (suggestions.isError) {
      emptyView = retry("Couldn't load recipes. Try again.", () => void suggestions.refetch());
    } else if (sections.length === 0) {
      emptyView =
        search !== null
          ? empty('No recipes found.', `Nothing matches "${search}". Try a different word.`)
          : empty('Nothing close yet.', 'Add a few more ingredients to your pantry and check back.');
    }
    if (ideas?.hasSpoonacular) footer = <SpoonacularCredit />;
    body = (
      <SectionList
        {...listProps}
        sections={sections}
        keyExtractor={(s) => s.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            style={[type.heading, { color: colors.ink, paddingTop: spacing.lg, paddingBottom: spacing.sm }]}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const card = cardFromSuggestion(item);
          return <RecipeCard recipe={card} variant="suggested" saved={isSaved(card.id)} onOpen={open} onToggleSaved={onToggleSaved} />;
        }}
        ListEmptyComponent={emptyView ?? undefined}
        ListFooterComponent={footer ?? undefined}
      />
    );
  } else {
    const isSavedFilter = filter === 'saved';
    const data = isSavedFilter ? savedCards : mineCards;
    const query = isSavedFilter ? saved.rows : mine;
    let emptyView: ReactElement | null = null;
    if (query.data === undefined) {
      emptyView = query.isError ? retry("Couldn't load recipes. Try again.", () => void query.refetch()) : loading('Loading recipes');
    } else if (isSavedFilter && query.data.length > 0 && saved.cards.isPending) {
      emptyView = loading('Loading recipes');
    } else if (isSavedFilter) {
      emptyView = empty('Nothing saved yet.', 'Tap the heart on any recipe to keep it here. Everyone in your household sees the same list.', (
        <PrimaryPillButton title="Find recipes" onPress={() => setFilter('suggested')} />
      ));
    } else {
      emptyView = empty('No household recipes yet.', "Your household's own recipes will show up here.");
    }
    body = (
      <FlatList
        {...listProps}
        data={data}
        keyExtractor={(card) => card.id}
        renderItem={({ item }) => (
          <RecipeCard recipe={item} variant="library" saved={isSaved(item.id)} onOpen={open} onToggleSaved={onToggleSaved} />
        )}
        ListEmptyComponent={emptyView ?? undefined}
        ListFooterComponent={data.some((c) => c.source === 'spoonacular') ? <SpoonacularCredit /> : undefined}
      />
    );
  }

  return <View style={{ flex: 1, backgroundColor: colors.background }}>{body}</View>;
}

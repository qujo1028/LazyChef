import { homeRecipesHeading, trendingLine, type HomeRecipeCard } from '@lazychef/core/home/trending';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { MetadataPill } from '@/components/MetadataPill';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { friendlyError } from '@/lib/household-settings';
import { readyLabel } from '@/lib/recipe-cards';
import { useOffline } from '@/lib/use-offline';
import { useTheme } from '@/theme';

import { useHomeRecipes } from '../api';

const CARD_WIDTH = 168;
const IMAGE_HEIGHT = 112;

/** Home: a sideways row of library recipes, trending ones first. Tap opens the recipe. */
export function RecipeRow() {
  const { colors, spacing, type } = useTheme();
  const router = useRouter();
  const offline = useOffline();
  const { cards, hasData, isError, isFetching, error, refetch } = useHomeRecipes();
  const open = useCallback((id: string) => router.push({ pathname: '/recipe/[id]', params: { id } }), [router]);

  let body;
  if (!hasData) {
    body =
      isError || offline ? (
        <View style={{ gap: spacing.md }}>
          <FormMessage tone="error" text={offline ? "You're offline and nothing is saved yet." : friendlyError(error)} />
          <PrimaryPillButton title="Try again" variant="outline" onPress={() => void refetch()} loading={isFetching} />
        </View>
      ) : (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading recipes" />
      );
  } else if (cards.length === 0) {
    body = <Text style={[type.body, { color: colors.muted }]}>No recipes to show yet. Check back soon.</Text>;
  } else {
    body = (
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(card) => card.id}
        renderItem={({ item }) => <RecipeTile card={item} onOpen={open} />}
        showsHorizontalScrollIndicator={false}
        // Bleed to the screen edge while the first card lines up with the content.
        style={{ marginHorizontal: -spacing.lg }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
      />
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
        {homeRecipesHeading(cards)}
      </Text>
      {body}
    </View>
  );
}

const RecipeTile = memo(function RecipeTile({ card, onOpen }: { card: HomeRecipeCard; onOpen: (id: string) => void }) {
  const { colors, radius, spacing, type } = useTheme();
  const time = readyLabel(card.readyInMinutes);
  const cooked = trendingLine(card);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[card.title, card.tag, cooked, time].filter(Boolean).join(', ')}
      onPress={() => onOpen(card.id)}
      style={({ pressed }) => ({
        width: CARD_WIDTH,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
        overflow: 'hidden',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {card.image ? (
        <Image
          source={{ uri: card.image }}
          accessibilityElementsHidden
          importantForAccessibility="no"
          contentFit="cover"
          transition={150}
          style={{ width: CARD_WIDTH, height: IMAGE_HEIGHT, backgroundColor: colors.surfacePressed }}
        />
      ) : (
        <View style={{ width: CARD_WIDTH, height: IMAGE_HEIGHT, backgroundColor: colors.pill, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 32 }}>🍽️</Text>
        </View>
      )}
      <View style={{ gap: spacing.xs, padding: spacing.md }}>
        <Text numberOfLines={2} style={[type.recipeTitle, { color: colors.ink, minHeight: 36 }]}>
          {card.title}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <MetadataPill label={card.tag} />
          {time ? <MetadataPill label={time} /> : null}
        </View>
        {cooked ? <Text style={[type.meta, { color: colors.muted }]}>{cooked}</Text> : null}
      </View>
    </Pressable>
  );
});

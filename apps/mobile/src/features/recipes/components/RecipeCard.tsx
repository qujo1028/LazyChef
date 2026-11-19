import { SOURCE_LABELS } from '@lazychef/core/recipes/ref';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { MetadataPill } from '@/components/MetadataPill';
import { haveLine, missingLine, readyLabel, type RecipeCardData } from '@/lib/recipe-cards';
import { useTheme } from '@/theme';

import { FavoriteButton } from './FavoriteButton';

type Props = {
  recipe: RecipeCardData;
  /** Suggested cards list what is missing; Saved and Mine say "Can make now" or "Have 5 of 7". */
  variant: 'suggested' | 'library';
  saved: boolean;
  onOpen: (id: string) => void;
  onToggleSaved: (recipe: RecipeCardData) => void;
};

/** One recipe: photo, title, time, source and what the pantry covers. Tap opens it; the heart saves it. */
export const RecipeCard = memo(function RecipeCard({ recipe, variant, saved, onOpen, onToggleSaved }: Props) {
  const { colors, radius, spacing, type } = useTheme();
  const time = readyLabel(recipe.readyInMinutes);
  const line =
    variant === 'suggested' ? (recipe.match ? missingLine(recipe.match.need) : null) : haveLine(recipe.match);
  const ready = recipe.match !== null && recipe.match.need.length === 0;
  const source = recipe.aiGenerated ? 'AI idea' : SOURCE_LABELS[recipe.source];
  return (
    <View style={{ paddingBottom: spacing.md }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[recipe.title, time, line].filter(Boolean).join(', ')}
            onPress={() => onOpen(recipe.id)}
            style={({ pressed }) => ({ flex: 1, flexDirection: 'row', gap: spacing.md, opacity: pressed ? 0.7 : 1 })}
          >
            {recipe.image ? (
              <Image
                source={{ uri: recipe.image }}
                accessibilityElementsHidden
                importantForAccessibility="no"
                contentFit="cover"
                transition={150}
                style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.surfacePressed }}
              />
            ) : (
              <View style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.pill, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 28 }}>🍽️</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text numberOfLines={2} style={[type.recipeTitle, { color: colors.ink }]}>
                {recipe.title}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {time ? <MetadataPill label={time} /> : null}
                <MetadataPill label={source} />
              </View>
              {line ? (
                <Text numberOfLines={2} style={[type.bodySmall, { color: ready ? colors.primary : colors.muted }]}>
                  {line}
                </Text>
              ) : null}
            </View>
          </Pressable>
          <FavoriteButton saved={saved} title={recipe.title} onToggle={() => onToggleSaved(recipe)} />
        </View>
      </Card>
    </View>
  );
});

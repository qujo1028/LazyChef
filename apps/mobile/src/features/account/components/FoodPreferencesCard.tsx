import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import {
  ALLERGIES,
  CUISINES,
  DIETS,
  type FoodPreferences,
} from '@lazychef/core/preferences/options';

import { Chip } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { SettingsCard } from '@/features/household/components/SettingsCard';
import { friendlyError } from '@/lib/household-settings';
import { prefsSummary, toggleValue } from '@/lib/preferences';
import { useTheme } from '@/theme';

import { useFoodPreferences, useSavePreferences } from '../api';

function Group({ legend, hint, children }: { legend: string; hint: string; children: React.ReactNode }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View accessible={false} style={{ gap: spacing.sm }}>
      <Text style={[type.bodySmall, styles.legend, { color: colors.ink }]}>
        {legend} <Text style={{ color: colors.muted, fontFamily: undefined }}>{hint}</Text>
      </Text>
      <View style={[styles.chips, { gap: spacing.sm }]}>{children}</View>
    </View>
  );
}

/** Diet, allergies, cuisines and world recipes. Only you see these; recipe ideas use them. */
export function FoodPreferencesCard() {
  const { colors, spacing, type } = useTheme();
  const saved = useFoodPreferences();
  const save = useSavePreferences();
  const [draft, setDraft] = useState<FoodPreferences | null>(null);

  const current = draft ?? saved.data ?? null;

  if (!current) {
    return (
      <SettingsCard title="Food preferences">
        {saved.isError ? (
          <>
            <FormMessage tone="error" text={friendlyError(saved.error)} />
            <PrimaryPillButton title="Try again" variant="outline" onPress={() => void saved.refetch()} loading={saved.isFetching} />
          </>
        ) : (
          <Text style={[type.bodySmall, { color: colors.muted }]}>Loading...</Text>
        )}
      </SettingsCard>
    );
  }

  const edit = (patch: Partial<FoodPreferences>) => {
    save.reset();
    setDraft({ ...current, ...patch });
  };
  const dirty = draft !== null;

  return (
    <SettingsCard
      title="Food preferences"
      description={dirty ? 'Recipe ideas hide what does not fit and put cuisines you like first. Only you see these.' : `${prefsSummary(current)}. Only you see these.`}
    >
      <View style={{ gap: spacing.lg }}>
        <Group legend="Diet" hint="Pick one">
          {DIETS.map((diet) => (
            <Chip
              key={diet.value}
              label={diet.label}
              selected={current.diet === diet.value}
              onPress={() => edit({ diet: current.diet === diet.value ? 'none' : diet.value })}
            />
          ))}
        </Group>
        <Group legend="Allergies and intolerances" hint="Pick any">
          {ALLERGIES.map((a) => (
            <Chip
              key={a.value}
              label={a.label}
              selected={current.allergies.includes(a.value)}
              onPress={() => edit({ allergies: toggleValue(current.allergies, a.value, !current.allergies.includes(a.value)) })}
            />
          ))}
        </Group>
        <Group legend="Cuisines you like" hint="Pick any">
          {CUISINES.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              selected={current.cuisines.includes(c.value)}
              onPress={() => edit({ cuisines: toggleValue(current.cuisines, c.value, !current.cuisines.includes(c.value)) })}
            />
          ))}
        </Group>
        <View style={[styles.switchRow, { gap: spacing.md }]}>
          <View style={styles.grow}>
            <Text style={[type.body, { color: colors.ink }]}>Include world recipes</Text>
            <Text style={[type.bodySmall, { color: colors.muted }]}>Jamaican, Polish, Syrian and more from the recipe library.</Text>
          </View>
          <Switch
            accessibilityLabel="Include world recipes"
            value={current.worldRecipes}
            onValueChange={(on) => edit({ worldRecipes: on })}
            trackColor={{ true: colors.primary }}
          />
        </View>
        {save.isError ? <FormMessage tone="error" text={friendlyError(save.error)} /> : null}
        {save.isSuccess && !dirty ? <FormMessage tone="success" text="Food preferences saved." /> : null}
        {dirty ? (
          <View style={[styles.chips, { gap: spacing.sm }]}>
            <View style={styles.button}>
              <PrimaryPillButton
                title="Save preferences"
                loading={save.isPending}
                onPress={() => save.mutate(current, { onSuccess: () => setDraft(null) })}
              />
            </View>
            <View style={styles.button}>
              <PrimaryPillButton title="Cancel" variant="outline" disabled={save.isPending} onPress={() => setDraft(null)} />
            </View>
          </View>
        ) : null}
      </View>
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  legend: { fontFamily: 'SourceSans3_600SemiBold' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  button: { flexGrow: 1, flexBasis: 140 },
});

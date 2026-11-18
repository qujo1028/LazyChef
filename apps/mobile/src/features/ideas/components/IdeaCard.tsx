import Ionicons from '@expo/vector-icons/Ionicons';
import type { AiIdea } from '@lazychef/core/ai/edge-contract';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useTheme } from '@/theme';

import type { IdeaActionResult } from '../api';

type Props = {
  idea: AiIdea;
  onSave: (idea: AiIdea) => Promise<IdeaActionResult>;
  onAddMissing: (idea: AiIdea) => Promise<IdeaActionResult>;
};

/** One AI idea: the basics, what you have and need, steps on demand, and the two actions. */
export function IdeaCard({ idea, onSave, onAddMissing }: Props) {
  const { colors, spacing, type, minTouch } = useTheme();
  const { recipe, missing } = idea;
  const [stepsOpen, setStepsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const busy = useRef(false);

  async function run(kind: 'save' | 'add') {
    if (busy.current) return;
    busy.current = true;
    (kind === 'save' ? setSaving : setAdding)(true);
    const result = await (kind === 'save' ? onSave(idea) : onAddMissing(idea));
    busy.current = false;
    (kind === 'save' ? setSaving : setAdding)(false);
    setNote({ tone: result.ok ? 'success' : 'error', text: result.message });
    if (result.ok) (kind === 'save' ? setSaved : setAdded)(true);
  }

  const meta = [`${recipe.minutes} min`, `Serves ${recipe.servings}`].join(' · ');

  return (
    <Card>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
          {recipe.title}
        </Text>
        <Text style={[type.meta, { color: colors.muted }]}>{meta}</Text>
        {recipe.description ? <Text style={[type.body, { color: colors.ink }]}>{recipe.description}</Text> : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        {recipe.ingredients.map((line, index) => {
          const have = line.fromPantry;
          return (
            <View key={`${line.name}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons
                name={have ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={have ? colors.primary : colors.muted}
                accessible={false}
              />
              <Text style={[type.bodySmall, { color: colors.ink, flex: 1 }]}>
                {line.amount ? `${line.amount} ` : ''}
                {line.name}
              </Text>
              <Text style={[type.meta, { color: have ? colors.primary : colors.muted }]}>{have ? 'Have' : 'Need'}</Text>
            </View>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: stepsOpen }}
        onPress={() => setStepsOpen((open) => !open)}
        style={{ minHeight: minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
      >
        <Text style={[type.button, { color: colors.primary }]}>{stepsOpen ? 'Hide steps' : 'Show steps'}</Text>
        <Ionicons name={stepsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
      </Pressable>
      {stepsOpen ? (
        <View style={{ gap: spacing.sm }}>
          {recipe.steps.map((step, index) => (
            <View key={index} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Text style={[type.bodySmall, { color: colors.muted, minWidth: 20 }]}>{index + 1}.</Text>
              <Text style={[type.bodySmall, { color: colors.ink, flex: 1 }]}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {note ? <FormMessage tone={note.tone} text={note.text} /> : null}

      <View style={{ gap: spacing.sm }}>
        <PrimaryPillButton
          title={saved ? 'Saved to Mine' : 'Save to Mine'}
          onPress={() => void run('save')}
          loading={saving}
          disabled={saved}
        />
        {missing.length > 0 ? (
          <PrimaryPillButton
            variant="outline"
            title={added ? 'Added to list' : `Add ${missing.length} missing to list`}
            onPress={() => void run('add')}
            loading={adding}
            disabled={added}
          />
        ) : null}
      </View>
    </Card>
  );
}

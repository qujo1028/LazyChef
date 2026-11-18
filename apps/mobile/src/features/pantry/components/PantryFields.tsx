// Form controls shared by the add, review and edit sheets.
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDays } from '@lazychef/core/dates/days';
import { CATEGORIES, type Category } from '@lazychef/core/ingredients/types';
import { shortDate, unitOptions } from '@lazychef/core/pantry/display';
import { QUICK_EXPIRY } from '@lazychef/core/pantry/staples';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { SelectField } from '@/components/SelectField';
import { Sheet } from '@/components/Sheet';
import { useTheme } from '@/theme';

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c.value, label: `${c.emoji} ${c.label}` }));

export function CategoryField({
  value,
  onChange,
  label = 'Category',
  hint,
  disabled,
}: {
  value: Category;
  onChange: (value: Category) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return <SelectField label={label} value={value} options={CATEGORY_OPTIONS} onChange={onChange} hint={hint} disabled={disabled} />;
}

/** The unit picker; keeps an unknown unit (e.g. "bunch") as a choice so it can still show. */
export function UnitField({
  value,
  onChange,
  label = 'Unit',
  hideLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  return (
    <SelectField label={label} hideLabel={hideLabel} value={value} options={unitOptions(value)} onChange={onChange} disabled={disabled} />
  );
}

function toDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Expiry as quick chips ("3 days", "1 week", "2 weeks") plus "Pick a date" (the system date
 * picker; not on Expo web). `value` is YYYY-MM-DD or "" (none). Tapping the selected chip clears it.
 */
export function ExpiryField({
  value,
  onChange,
  today,
  label = 'Expires',
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  today: string;
  label?: string;
  disabled?: boolean;
}) {
  const { colors, spacing, type } = useTheme();
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(() => toDate(value || addDays(today, 7)));
  const quick = QUICK_EXPIRY.map((option) => ({ ...option, date: addDays(today, option.days) }));
  const custom = value !== '' && !quick.some((option) => option.date === value);
  const canPick = Platform.OS !== 'web';

  function openPicker() {
    setDraft(toDate(value || addDays(today, 7)));
    setPicking(true);
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.bodySmall, styles.label, { color: colors.ink }]}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.row, { gap: spacing.sm }]}>
        {quick.map((option) => {
          const selected = option.date === value;
          return (
            <Chip
              key={option.days}
              label={option.label}
              selected={selected}
              disabled={disabled}
              accessibilityLabel={`${option.label}, ${shortDate(option.date)}`}
              onPress={() => onChange(selected ? '' : option.date)}
            />
          );
        })}
        {canPick ? (
          <Chip
            label={custom ? shortDate(value) : 'Pick a date'}
            icon="calendar-outline"
            selected={custom}
            disabled={disabled}
            accessibilityLabel={custom ? `Expires ${shortDate(value)}. Change date` : 'Pick an expiry date'}
            onPress={openPicker}
          />
        ) : null}
        {value ? <Chip label="No date" icon="close" disabled={disabled} onPress={() => onChange('')} /> : null}
      </View>

      {canPick && Platform.OS === 'android' && picking ? (
        <DateTimePicker
          value={draft}
          mode="date"
          onChange={(event, date) => {
            setPicking(false);
            if (event.type === 'set' && date) onChange(toKey(date));
          }}
        />
      ) : null}
      {canPick && Platform.OS === 'ios' ? (
        <Sheet
          visible={picking}
          onClose={() => setPicking(false)}
          title="Expiry date"
          footer={
            <View style={styles.fill}>
              <PrimaryPillButton
                title="Use this date"
                onPress={() => {
                  onChange(toKey(draft));
                  setPicking(false);
                }}
              />
            </View>
          }
        >
          <DateTimePicker
            value={draft}
            mode="date"
            display="inline"
            accentColor={colors.primary}
            onChange={(_, date) => {
              if (date) setDraft(date);
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'SourceSans3_600SemiBold' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  fill: { flex: 1 },
});

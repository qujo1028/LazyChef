import Ionicons from '@expo/vector-icons/Ionicons';
import { ingredientEmoji } from '@lazychef/core/ingredients/emoji';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { TextField } from '@/components/TextField';
import type { ScanRow } from '@/lib/scan-rows';
import { useTheme } from '@/theme';

import { BarcodeScanner } from '../../barcodes/components/BarcodeScanner';

/** A known real product, so the scan flow can be tried without a camera. Dev builds only. */
const DEV_CODE = '3017620422003';

type Props = {
  rows: ScanRow[];
  active: boolean;
  onCode: (code: string) => string | null;
  onRetry: (key: number, code: string) => void;
  onName: (key: number, code: string, name: string) => void;
  onRemove: (key: number) => void;
};

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, minTouch } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="close" size={22} color={colors.muted} />
    </Pressable>
  );
}

function NameIt({ code, onName }: { code: string; onName: (name: string) => void }) {
  const { spacing } = useTheme();
  const [value, setValue] = useState('');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <TextField
          label={`What is barcode ${code}?`}
          placeholder="e.g. oat milk"
          value={value}
          onChangeText={setValue}
          onSubmitEditing={() => value.trim() && onName(value)}
          returnKeyType="done"
          maxLength={80}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <PrimaryPillButton title="Save" variant="outline" onPress={() => onName(value)} disabled={!value.trim()} />
    </View>
  );
}

function Row({ row, onRetry, onName, onRemove }: { row: ScanRow } & Pick<Props, 'onRetry' | 'onName' | 'onRemove'>) {
  const { colors, spacing, type, minTouch } = useTheme();
  const box = { minHeight: minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm } as const;

  if (row.status === 'found') {
    const { hit } = row;
    return (
      <View style={box}>
        <Text style={{ fontSize: 22 }} accessibilityElementsHidden importantForAccessibility="no">
          {ingredientEmoji(hit.name)}
        </Text>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[type.body, { color: colors.ink }]}>
            {hit.line}
          </Text>
          {hit.label.toLowerCase() !== hit.name ? (
            <Text numberOfLines={1} style={[type.bodySmall, { color: colors.muted }]}>
              {hit.label}
            </Text>
          ) : null}
        </View>
        <RemoveButton label={`Remove ${hit.name}`} onPress={() => onRemove(row.key)} />
      </View>
    );
  }

  const message =
    row.status === 'looking' ? 'Looking it up...' : row.status === 'missing' ? 'Unknown product' : row.message;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={box}>
        {row.status === 'looking' ? (
          <ActivityIndicator color={colors.muted} />
        ) : (
          <Ionicons name="alert-circle-outline" size={22} color={colors.accent} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { color: colors.ink }]}>{message}</Text>
          <Text style={[type.bodySmall, { color: colors.muted }]}>{row.code}</Text>
        </View>
        {row.status === 'error' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => onRetry(row.key, row.code)}
            style={{ width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="refresh" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        <RemoveButton label={`Remove ${row.code}`} onPress={() => onRemove(row.key)} />
      </View>
      {row.status === 'missing' ? <NameIt code={row.code} onName={(name) => onName(row.key, row.code, name)} /> : null}
    </View>
  );
}

/** The scan view of the Add food sheet: camera, typed code, and what's been scanned so far. */
export function ScanPanel({ rows, active, onCode, onRetry, onName, onRemove }: Props) {
  const { colors, radius, spacing, type } = useTheme();
  const [codeError, setCodeError] = useState<string | null>(null);

  function handleCode(code: string) {
    setCodeError(onCode(code));
  }

  return (
    <View style={{ gap: spacing.md }}>
      <BarcodeScanner active={active} onCode={handleCode} />
      {codeError ? <FormMessage tone="error" text={codeError} /> : null}
      {__DEV__ ? (
        <View style={{ alignItems: 'flex-start' }}>
          <PrimaryPillButton title="Dev: fake scan" variant="text" onPress={() => handleCode(DEV_CODE)} />
        </View>
      ) : null}
      {rows.length === 0 ? (
        <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>Nothing scanned yet.</Text>
      ) : (
        <View
          accessibilityLiveRegion="polite"
          style={{
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.divider,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
          }}
        >
          {rows.map((row, i) => (
            <View
              key={row.key}
              style={{
                paddingVertical: spacing.xs,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.divider,
              }}
            >
              <Row row={row} onRetry={onRetry} onName={onName} onRemove={onRemove} />
            </View>
          ))}
        </View>
      )}
      <Text style={[type.bodySmall, { color: colors.muted, textAlign: 'center' }]}>
        Product data from Open Food Facts
      </Text>
    </View>
  );
}

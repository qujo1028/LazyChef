// The camera scanner: expo-camera's CameraView reading grocery barcodes (EAN-13, EAN-8, UPC-A,
// UPC-E), permission asked on first use, a clear denied state with Open Settings, a torch toggle,
// and a "type the code" box that always works (and is all Expo web has). Never looks anything up;
// it hands raw codes to `onCode`.
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { TextField } from '@/components/TextField';
import { haptic } from '@/lib/haptics';
import { acceptScan, type ScanMemory } from '@/lib/scan-dedupe';
import { useTheme } from '@/theme';

type Props = {
  /** A raw code from the camera or the typed box. The caller normalizes and looks it up. */
  onCode: (code: string) => void;
  /** False pauses scanning (say while the sheet is closing). */
  active: boolean;
};

const GROCERY_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];
const CAMERA_HEIGHT = 220;

export function BarcodeScanner({ onCode, active }: Props) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const hasCamera = Platform.OS !== 'web';
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [typed, setTyped] = useState('');
  const last = useRef<ScanMemory>(null);

  function read(result: BarcodeScanningResult) {
    if (!active) return;
    const { accept, next } = acceptScan(last.current, result.data, Date.now());
    if (!accept) return;
    last.current = next;
    haptic('light');
    onCode(result.data);
  }

  function submitTyped() {
    const code = typed.trim();
    if (!code) return;
    setTyped('');
    onCode(code);
  }

  // Ask on first use: when the scanner shows and the answer is still open.
  const askable =
    hasCamera && permission !== null && !permission.granted && permission.canAskAgain && permission.status === 'undetermined';
  useEffect(() => {
    if (askable) void requestPermission();
  }, [askable, requestPermission]);

  const granted = permission?.granted === true;
  const denied = permission !== null && !permission.granted && !permission.canAskAgain;

  return (
    <View style={{ gap: spacing.md }}>
      {hasCamera ? (
        <View
          style={{
            height: CAMERA_HEIGHT,
            borderRadius: radius.md,
            overflow: 'hidden',
            backgroundColor: colors.surfacePressed,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.lg,
          }}
        >
          {granted ? (
            <>
              <CameraView
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                facing="back"
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: GROCERY_TYPES }}
                onBarcodeScanned={active ? read : undefined}
                accessibilityLabel="Camera. Point it at a barcode."
              />
              <View
                pointerEvents="none"
                style={{
                  width: '78%',
                  height: '45%',
                  borderRadius: radius.md,
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.85)',
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={torch ? 'Turn the light off' : 'Turn the light on'}
                accessibilityState={{ selected: torch }}
                onPress={() => setTorch((on) => !on)}
                hitSlop={4}
                style={{
                  position: 'absolute',
                  right: spacing.sm,
                  bottom: spacing.sm,
                  width: minTouch,
                  height: minTouch,
                  borderRadius: minTouch / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: torch ? colors.accent : 'rgba(0,0,0,0.55)',
                }}
              >
                <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color="#FFFFFF" />
              </Pressable>
            </>
          ) : permission === null ? (
            <Text style={[type.body, { color: colors.muted }]}>Starting the camera...</Text>
          ) : denied ? (
            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="camera-outline" size={28} color={colors.muted} />
              <Text style={[type.body, { color: colors.ink, textAlign: 'center' }]}>
                Camera access is off. Turn it on in Settings to scan, or type the code below.
              </Text>
              <PrimaryPillButton title="Open Settings" variant="outline" onPress={() => void Linking.openSettings()} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="camera-outline" size={28} color={colors.muted} />
              <Text style={[type.body, { color: colors.ink, textAlign: 'center' }]}>
                Allow the camera to scan barcodes, or type the code below.
              </Text>
              <PrimaryPillButton title="Allow camera" onPress={() => void requestPermission()} />
            </View>
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Or type the code"
            placeholder="The numbers under the barcode"
            value={typed}
            onChangeText={setTyped}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={submitTyped}
            maxLength={20}
            autoCorrect={false}
          />
        </View>
        <PrimaryPillButton title="Add" variant="outline" onPress={submitTyped} disabled={!typed.trim() || !active} />
      </View>
    </View>
  );
}

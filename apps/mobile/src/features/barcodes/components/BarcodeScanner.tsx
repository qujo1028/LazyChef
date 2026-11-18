// STUB (P5 step 0). W3 builds the camera scanner with expo-camera (CameraView barcode
// scanning): permission asked on first use with a clear denied state, a "type the code" box,
// the same code again within 2.5 s ignored, a torch toggle. Keep these props.
import { Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  /** A raw code from the camera or the typed box. The caller normalizes and looks it up. */
  onCode: (code: string) => void;
  /** False pauses scanning (say while a lookup runs or the sheet is closing). */
  active: boolean;
};

export function BarcodeScanner({ onCode, active }: Props) {
  const { colors, type } = useTheme();
  void onCode;
  void active;
  return (
    <View>
      <Text style={[type.body, { color: colors.muted }]}>Scanning is coming soon.</Text>
    </View>
  );
}

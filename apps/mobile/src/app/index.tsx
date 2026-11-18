import { StyleSheet, Text, View } from 'react-native';

// Placeholder. W2 replaces this with the tab layout.
export default function Index() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>LazyChef</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F6EC' },
  title: { fontSize: 18, color: '#2A2418' },
});

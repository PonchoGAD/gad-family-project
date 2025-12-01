// apps/mobile/src/screens/MapScreen.tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../wallet/ui/theme';

export default function MapScreen() {
  const G = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: G.colors.bg }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: G.colors.text }]}>
          Map
        </Text>
        <Text style={[styles.subtitle, { color: G.colors.textMuted }]}>
          Here will be live family map, safe zones and geolocation logic.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
});

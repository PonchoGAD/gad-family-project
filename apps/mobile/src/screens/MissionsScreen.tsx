// apps/mobile/src/screens/MissionsScreen.tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../wallet/ui/theme';

export default function MissionsScreen() {
  const G = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: G.colors.bg }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: G.colors.text }]}>
          Missions
        </Text>
        <Text style={[styles.subtitle, { color: G.colors.textMuted }]}>
          Daily/weekly missions, step-to-earn tasks and rewards will live here.
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

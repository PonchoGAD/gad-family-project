// apps/mobile/src/screens/PrivacyScreen.tsx
import React, { useState } from "react";
import { View, Text, Switch, Alert } from "react-native";
import { fn } from "../firebase";


export default function PrivacyScreen() {
  const [enabled, setEnabled] = useState(true);

  async function toggle(v: boolean) {
    setEnabled(v);
    try {
      const res: any = await (fn as any).setGeoPreference({ enabled: v });
      if (!res?.data?.ok) throw new Error("Not saved");
    } catch (e: any) {
      setEnabled(!v);
      Alert.alert("Ошибка", e.message ?? String(e));
    }
  }

  return (
    <View
      style={{
        padding: 16,
        gap: 12,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Text>Геолокация включена</Text>
      <Switch value={enabled} onValueChange={toggle} />
    </View>
  );
}

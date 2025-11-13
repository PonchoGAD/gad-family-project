// apps/mobile/src/screens/FamilyTreasuryScreen.tsx
import React from "react";
import { ScrollView, View, Text } from "react-native";
import LockTimer from "../components/LockTimer";
import ProofOfLock from "../components/ProofOfLock";

export default function FamilyTreasuryScreen() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0b0c0f" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={{ gap: 16 }}>
        <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 18 }}>
          Family Treasury
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 14 }}>
          Long-term locked GAD for your family. This screen shows the global
          treasury lock schedule and public proof of lock.
        </Text>

        <LockTimer />
        <ProofOfLock />
      </View>
    </ScrollView>
  );
}

// apps/mobile/src/screens/FamilyTreasuryScreen.tsx
import { ScrollView, View } from "react-native";
import LockTimer from "../components/LockTimer";
import ProofOfLock from "../components/ProofOfLock";

export default function FamilyTreasuryScreen() {
  return (
    <ScrollView style={{ flex: 1, padding: 16, backgroundColor: "#0b0c0f" }}>
      <View style={{ gap: 16 }}>
        <LockTimer />
        <ProofOfLock />
      </View>
    </ScrollView>
  );
}

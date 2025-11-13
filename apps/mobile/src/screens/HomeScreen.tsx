// apps/mobile/src/screens/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Button } from "react-native";
import { TREASURY, getTreasuryBalance } from "../lib/treasury";

export default function HomeScreen({ navigation }: any) {
  const [treasuryBalance, setTreasuryBalance] = useState<string>("—");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const bal = await getTreasuryBalance();
        setTreasuryBalance(`${bal.pretty} GAD`);
      } catch {
        setTreasuryBalance("On-chain data not available in this build");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: "#0b0c0f" }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: "#ffffff" }}>
        Welcome to GAD Family
      </Text>
      <Text style={{ color: "#9ca3af", marginTop: 6 }}>
        Family-first Move-to-Earn app: steps → GAD points → long-term family
        treasury.
      </Text>

      <View
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 12,
          backgroundColor: "#111827",
        }}
      >
        <Text style={{ color: "#e5e7eb", fontWeight: "600" }}>
          Global Treasury SAFE
        </Text>
        <Text
          style={{ color: "#9ca3af", marginTop: 4, fontSize: 12 }}
          numberOfLines={1}
        >
          {TREASURY}
        </Text>

        <Text style={{ color: "#9ca3af", marginTop: 10 }}>
          Estimated balance:
        </Text>
        <Text
          style={{
            color: "#4ade80",
            fontWeight: "700",
            fontSize: 16,
            marginTop: 4,
          }}
        >
          {loading ? "Loading…" : treasuryBalance}
        </Text>

        <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
          On-chain data is read-only in this mobile build. Full controls are
          available on the web dashboard.
        </Text>
      </View>

      <View style={{ marginTop: 24, gap: 10 }}>
        <Button title="Open Wallet" onPress={() => navigation.navigate("Wallet")} />
        <Button title="Steps Tracker" onPress={() => navigation.navigate("Steps")} />
        <Button
          title="Family & Treasury"
          onPress={() => navigation.navigate("Family")}
        />
      </View>
    </View>
  );
}

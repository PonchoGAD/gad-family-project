// apps/mobile/src/components/LiquidityPoolWidget.tsx
import React, { useEffect, useState, useMemo } from "react";
import { View, Text, TextInput, Button, Alert, Linking } from "react-native";

type LiquidityPoolWidgetProps = {
  defaultPairAddress?: string; // BSC LP pair (0x...)
  defaultTab?: "dex" | "gecko";
};

const isValidPair = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());

function buildDexUrl(pair: string, tab: "dex" | "gecko"): string {
  const p = pair.trim();
  if (!isValidPair(p)) return "";
  if (tab === "dex") {
    return `https://dexscreener.com/bsc/${p}?embed=1&theme=dark`;
  }
  return `https://www.geckoterminal.com/bsc/pools/${p}?embed=1&info=1&swaps=1`;
}

export default function LiquidityPoolWidget({
  defaultPairAddress = "",
  defaultTab = "dex",
}: LiquidityPoolWidgetProps) {
  const [pair, setPair] = useState<string>(defaultPairAddress);
  const [input, setInput] = useState<string>(defaultPairAddress);
  const [tab, setTab] = useState<"dex" | "gecko">(defaultTab);

  useEffect(() => {
    setPair(defaultPairAddress);
    setInput(defaultPairAddress);
  }, [defaultPairAddress]);

  const url = useMemo(() => buildDexUrl(pair, tab), [pair, tab]);

  const applyPair = () => {
    if (!isValidPair(input)) {
      Alert.alert("Invalid address", "Please paste a valid BSC pair address (0x...).");
      return;
    }
    setPair(input.trim());
  };

  const openInBrowser = () => {
    if (!url) {
      Alert.alert("Pair not set", "Set a valid pair address first.");
      return;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert("Error", "Failed to open browser for this URL.");
    });
  };

  return (
    <View
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 12,
        backgroundColor: "#101114",
        borderWidth: 1,
        borderColor: "#1f2933",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>
          Liquidity Pool
        </Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            title="DexScreener"
            onPress={() => setTab("dex")}
            color={tab === "dex" ? "#3b82f6" : "#4b5563"}
          />
          <Button
            title="GeckoTerminal"
            onPress={() => setTab("gecko")}
            color={tab === "gecko" ? "#3b82f6" : "#4b5563"}
          />
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: "#9ca3af", marginBottom: 4 }}>BSC pair address (0x...)</Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Paste PancakeSwap LP pair address"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: "#374151",
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: "#e5e7eb",
          }}
        />
        <View style={{ flexDirection: "row", marginTop: 8, gap: 8 }}>
          <Button title="Set Pair" onPress={applyPair} />
          <Button title="Open in Browser" onPress={openInBrowser} />
        </View>
        <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
          After you create a pool on PancakeSwap, copy the pair address and set it here to open live charts.
        </Text>
      </View>

      <View
        style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 8,
          backgroundColor: "#0b0c10",
        }}
      >
        <Text style={{ color: "#9ca3af", fontSize: 12 }}>
          Selected tab:{" "}
          <Text style={{ fontWeight: "600", color: "#e5e7eb" }}>
            {tab === "dex" ? "DexScreener" : "GeckoTerminal"}
          </Text>
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>
          Current pair:{" "}
          <Text style={{ color: isValidPair(pair) ? "#4ade80" : "#f97316" }}>
            {pair || "not set"}
          </Text>
        </Text>
      </View>
    </View>
  );
}

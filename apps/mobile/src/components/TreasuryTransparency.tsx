// apps/mobile/src/components/TreasuryTransparency.tsx
import React from "react";
import { View, Text, Pressable, Linking, ScrollView } from "react-native";
import cfg from "../config/treasury.json";
import { buildTranches, nextUnlock } from "../lib/schedule";

const link = (a: string) => `https://bscscan.com/address/${a}`;
const short = (a: string) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

export default function TreasuryTransparency() {
  const dates = buildTranches(cfg.lockStart, cfg.tranches, cfg.monthsBetween);
  const { next, index } = nextUnlock(dates);
  const progress = Math.round((index / cfg.tranches) * 100);

  const rows: Array<[string, string]> = [
    ["GAD Token", cfg.token],
    ["TeamFinance Lock", cfg.teamFinanceLock],
    ["Treasury SAFE", cfg.treasurySafe],
    ["Distribution SAFE", cfg.distributionSafe],
    ["Hot Payout Wallet", cfg.hotPayoutWallet],
  ];

  const open = (addr: string) => {
    if (!addr) return;
    Linking.openURL(link(addr)).catch(() => {
      // ignore / could show alert
    });
  };

  return (
    <ScrollView
      style={{
        marginTop: 16,
        borderRadius: 12,
        backgroundColor: "#0b0c10",
        borderWidth: 1,
        borderColor: "#1f2330",
      }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "700" }}>
        GAD Treasury Transparency
      </Text>
      <Text style={{ color: "#e5e7eb", marginTop: 8 }}>
        5T locked in TeamFinance. Unlocks: {cfg.tranches} × 500B every{" "}
        {cfg.monthsBetween} months → to Distribution SAFE.
      </Text>

      <View
        style={{
          height: 10,
          backgroundColor: "#1f2330",
          borderRadius: 6,
          overflow: "hidden",
          marginTop: 10,
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${progress}%`,
            backgroundColor: "#4ade80",
          }}
        />
      </View>
      <Text style={{ color: "#9ca3af", marginTop: 6 }}>
        Completed {index}/{cfg.tranches} • Next unlock:{" "}
        <Text style={{ fontWeight: "600" }}>
          {next ?? "All released"}
        </Text>
      </Text>

      <View style={{ marginTop: 12 }}>
        {rows.map(([label, addr]) => (
          <Pressable
            key={label}
            onPress={() => open(addr)}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: "#1f2330",
            }}
          >
            <Text style={{ color: "#9ca3af" }}>{label}</Text>
            <Text style={{ color: addr ? "#60a5fa" : "#6b7280" }}>
              {addr ? short(addr) : "—"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: "#9ca3af", fontSize: 13, marginBottom: 4 }}>
          Full unlock schedule:
        </Text>
        {dates.map((d, i) => (
          <Text key={d} style={{ color: "#6b7280", fontSize: 12 }}>
            {i + 1}. {d} — 500B
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

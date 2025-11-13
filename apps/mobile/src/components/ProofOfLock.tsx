// apps/mobile/src/components/ProofOfLock.tsx
import React from "react";
import { View, Text, Linking, Pressable } from "react-native";
import treasuryJson from "../config/treasury.json";
import { ADDR } from "../lib/chains";

const bsc = (addr: string) => `https://bscscan.com/address/${addr}`;

const TOKEN_ADDRESS: string =
  (treasuryJson as any).token ?? ADDR.GAD;

const TEAM_FINANCE_LOCK: string =
  (treasuryJson as any).teamFinanceLock ?? "";

const TREASURY_SAFE: string =
  (treasuryJson as any).treasurySafe ?? ADDR.TreasurySafe;

const DISTRIBUTION_SAFE: string =
  (treasuryJson as any).distributionSafe ?? "";

const HOT_PAYOUT_WALLET: string =
  (treasuryJson as any).hotPayoutWallet ?? "";

const TRANCHES: number =
  (treasuryJson as any).tranches ?? 0;

const MONTHS_BETWEEN: number =
  (treasuryJson as any).monthsBetween ?? 0;

export default function ProofOfLock() {
  const rows: Array<[string, string]> = [
    ["GAD Token", TOKEN_ADDRESS],
    ["TeamFinance Lock", TEAM_FINANCE_LOCK],
    ["Treasury SAFE", TREASURY_SAFE],
    ["Distribution SAFE", DISTRIBUTION_SAFE],
    ["Hot Payout Wallet", HOT_PAYOUT_WALLET],
  ];

  const openIfAny = (addr: string) => {
    if (!addr) return;
    Linking.openURL(bsc(addr)).catch(() => {
      // ignore or show toast if needed
    });
  };

  return (
    <View
      style={{
        padding: 16,
        borderRadius: 12,
        backgroundColor: "#101114",
      }}
    >
      <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 18 }}>
        Treasury transparency
      </Text>

      {rows.map(([label, addr]) => (
        <Pressable
          key={label}
          onPress={() => openIfAny(addr)}
          style={{ paddingVertical: 8 }}
        >
          <Text style={{ color: "#9ca3af" }}>{label}</Text>
          <Text style={{ color: addr ? "#60a5fa" : "#6b7280" }}>
            {addr || "—"}
          </Text>
        </Pressable>
      ))}

      <Text style={{ color: "#e5e7eb", marginTop: 8, fontSize: 12 }}>
        5T GAD locked in TeamFinance. Unlocks in {TRANCHES} tranches of 500B
        every {MONTHS_BETWEEN} months to the Distribution SAFE. All flows are
        verifiable on BscScan.
      </Text>
    </View>
  );
}

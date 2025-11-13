// apps/mobile/src/components/LockTimer.tsx
import React from "react";
import { View, Text } from "react-native";
import { nextUnlock } from "../lib/unlock";
import treasuryJson from "../config/treasury.json";
import { ADDR } from "../lib/chains";

const TRANCHES: Array<{ amount?: string; unlockAt?: number; date?: string }> =
  (treasuryJson as any).TRANCHES ??
  (treasuryJson as any).tranches ??
  [];

const DISTRIBUTION_SAFE: string =
  (treasuryJson as any).DISTRIBUTION_SAFE ??
  (treasuryJson as any).distributionSafe ??
  ADDR.TreasurySafe;

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function short(addr: string) {
  return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "";
}

export default function LockTimer() {
  const { next, index } = nextUnlock();
  const total = TRANCHES.length;
  const completed = Math.min(index, total);
  const remaining = Math.max(total - completed, 0);

  const today = new Date();
  const dNext = next ? new Date(`${next}T00:00:00Z`) : null;
  const days = dNext ? daysBetween(today, dNext) : 0;

  return (
    <View
      style={{
        padding: 16,
        borderRadius: 12,
        backgroundColor: "#101114",
      }}
    >
      <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "700" }}>
        Vesting schedule
      </Text>

      <Text style={{ color: "#d1d5db", marginTop: 6 }}>
        Next unlock:{" "}
        {next ? next : "all tranches unlocked"}{" "}
        {dNext ? `(${days} days left)` : ""}
      </Text>

      <View
        style={{
          height: 10,
          backgroundColor: "#1f2933",
          borderRadius: 6,
          marginTop: 10,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${total > 0 ? (completed / total) * 100 : 0}%`,
            backgroundColor: "#4ade80",
            height: "100%",
          }}
        />
      </View>

      <Text style={{ color: "#9ca3af", marginTop: 6 }}>
        Completed {completed}/{total} • Remaining {remaining}
      </Text>

      <Text style={{ color: "#6b7280", marginTop: 8, fontSize: 12 }}>
        Distribution SAFE receiver: {short(DISTRIBUTION_SAFE)}
      </Text>
    </View>
  );
}

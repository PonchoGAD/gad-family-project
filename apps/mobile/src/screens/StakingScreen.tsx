// ---------------------------------------------------------------
// apps/mobile/src/screens/StakingScreen.tsx
// GAD Staking
// - GAD UI (useTheme)
// - Поддержка DemoContext (демо-режим без реальных транзакций)
// - Сохранена логика getStakingInfo / stake / unstake / claimRewards
// ---------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Pressable,
  Alert,
} from "react-native";
import {
  getStakingInfo,
  stake,
  unstake,
  claimRewards,
} from "../lib/staking";
import { useTheme } from "../wallet/ui/theme";
import { useIsDemo } from "../demo/DemoContext";

type StakingInfo = {
  apr: number;
  staked: number;
  rewards: number;
};

export default function StakingScreen() {
  const G = useTheme();
  const isDemo = useIsDemo();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<StakingInfo | null>(null);

  const [amount, setAmount] = useState("");
  const [processing, setProcessing] = useState(false);

  async function load() {
    try {
      setLoading(true);

      if (isDemo) {
        // DEMO: стабильная витрина стейкинга GAD
        setInfo({
          apr: 18.5,
          staked: 250_000,
          rewards: 3_450,
        });
        return;
      }

      const data = await getStakingInfo();
      setInfo({
        apr: Number(data.apr ?? 0),
        staked: Number(data.staked ?? 0),
        rewards: Number(data.rewards ?? 0),
      });
    } catch (e: any) {
      Alert.alert("Staking", e?.message ?? "Failed to load staking data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [isDemo]);

  async function handleStake() {
    const n = Number(amount);
    if (!n || n <= 0) return;

    try {
      setProcessing(true);

      if (isDemo) {
        setInfo((prev) =>
          prev
            ? {
                ...prev,
                staked: prev.staked + n,
              }
            : { apr: 18.5, staked: n, rewards: 0 }
        );
        setAmount("");
        Alert.alert("Staking (demo)", "Simulated stake in demo mode.");
        return;
      }

      await stake(n);
      setAmount("");
      await load();
      Alert.alert("Staking", "Successfully staked");
    } catch (e: any) {
      Alert.alert("Staking", e?.message ?? "Failed to stake");
    } finally {
      setProcessing(false);
    }
  }

  async function handleUnstake() {
    const n = Number(amount);
    if (!n || n <= 0) return;

    try {
      setProcessing(true);

      if (isDemo) {
        setInfo((prev) => {
          if (!prev) {
            return { apr: 18.5, staked: 0, rewards: 0 };
          }
          const newStaked = Math.max(0, prev.staked - n);
          return {
            ...prev,
            staked: newStaked,
          };
        });
        setAmount("");
        Alert.alert("Staking (demo)", "Simulated unstake in demo mode.");
        return;
      }

      await unstake(n);
      setAmount("");
      await load();
      Alert.alert("Staking", "Successfully unstaked");
    } catch (e: any) {
      Alert.alert("Staking", e?.message ?? "Failed to unstake");
    } finally {
      setProcessing(false);
    }
  }

  async function handleClaim() {
    try {
      setProcessing(true);

      if (isDemo) {
        setInfo((prev) =>
          prev
            ? {
                ...prev,
                rewards: 0,
              }
            : { apr: 18.5, staked: 0, rewards: 0 }
        );
        Alert.alert(
          "Staking (demo)",
          "Simulated reward claim. In production, GAD tokens will be sent to your wallet."
        );
        return;
      }

      await claimRewards();
      await load();
      Alert.alert("Staking", "Rewards claimed");
    } catch (e: any) {
      Alert.alert("Staking", e?.message ?? "Failed to claim");
    } finally {
      setProcessing(false);
    }
  }

  if (loading || !info) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: G.colors.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={G.colors.accent} />
        <Text style={{ color: G.colors.textMuted, marginTop: 8 }}>
          Loading staking…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: G.colors.bg }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Text
        style={{
          color: G.colors.text,
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 8,
        }}
      >
        Staking{isDemo ? " (demo)" : ""}
      </Text>

      <Text
        style={{ color: G.colors.textMuted, fontSize: 13, marginBottom: 14 }}
      >
        Stake GAD to earn more GAD. In demo mode all numbers are simulated for
        investor preview — no real blockchain transactions.
      </Text>

      {/* APR */}
      <View
        style={{
          backgroundColor: G.colors.card,
          borderRadius: 16,
          padding: 16,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text style={{ color: G.colors.textMuted }}>APR</Text>
        <Text
          style={{
            color: G.colors.accent,
            fontSize: 24,
            fontWeight: "700",
            marginTop: 4,
          }}
        >
          {info.apr}% APY
        </Text>
      </View>

      {/* BALANCES */}
      <View
        style={{
          backgroundColor: G.colors.card,
          borderRadius: 16,
          padding: 16,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text style={{ color: G.colors.textMuted }}>Staked</Text>
        <Text
          style={{
            color: G.colors.text,
            fontSize: 22,
            fontWeight: "600",
          }}
        >
          {info.staked.toLocaleString("en-US")} GAD
        </Text>

        <Text style={{ color: G.colors.textMuted, marginTop: 12 }}>
          Rewards
        </Text>
        <Text
          style={{
            color: G.colors.accent,
            fontSize: 22,
            fontWeight: "600",
          }}
        >
          {info.rewards.toLocaleString("en-US")} GAD
        </Text>

        <Pressable
          onPress={handleClaim}
          disabled={processing || info.rewards <= 0}
          style={{
            marginTop: 12,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: G.colors.accent,
            alignItems: "center",
            opacity: processing || info.rewards <= 0 ? 0.4 : 1,
          }}
        >
          <Text
            style={{
              color: G.colors.bg,
              fontWeight: "700",
              fontSize: 14,
            }}
          >
            Claim rewards
          </Text>
        </Pressable>
      </View>

      {/* STAKE / UNSTAKE FORM */}
      <View
        style={{
          backgroundColor: G.colors.card,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <TextInput
          placeholder="Amount"
          placeholderTextColor={G.colors.textMuted}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
          style={{
            backgroundColor: G.colors.bg,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            color: G.colors.text,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        />

        <Pressable
          onPress={handleStake}
          disabled={processing}
          style={{
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: G.colors.accent,
            alignItems: "center",
            marginBottom: 10,
            opacity: processing ? 0.4 : 1,
          }}
        >
          <Text
            style={{
              color: G.colors.bg,
              fontWeight: "700",
            }}
          >
            Stake
          </Text>
        </Pressable>

        <Pressable
          onPress={handleUnstake}
          disabled={processing}
          style={{
            paddingVertical: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: G.colors.accent,
            alignItems: "center",
            opacity: processing ? 0.4 : 1,
          }}
        >
          <Text
            style={{
              color: G.colors.accent,
              fontWeight: "700",
            }}
          >
            Unstake
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

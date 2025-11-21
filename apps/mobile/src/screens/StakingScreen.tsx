// apps/mobile/src/screens/StakingScreen.tsx

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

export default function StakingScreen() {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<any>(null);

  const [amount, setAmount] = useState("");
  const [processing, setProcessing] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const data = await getStakingInfo();
      setInfo(data);
    } catch (e: any) {
      Alert.alert("Staking", e?.message ?? "Failed to load staking data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleStake() {
    const n = Number(amount);
    if (!n || n <= 0) return;

    try {
      setProcessing(true);
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
          backgroundColor: "#020617",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator />
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>
          Loading staking…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#020617" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Text
        style={{
          color: "#f9fafb",
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 12,
        }}
      >
        Staking
      </Text>

      {/* APR */}
      <View
        style={{
          backgroundColor: "#0f172a",
          borderRadius: 16,
          padding: 16,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: "rgba(148,163,184,0.4)",
        }}
      >
        <Text style={{ color: "#9ca3af" }}>APR</Text>
        <Text
          style={{ color: "#fbbf24", fontSize: 24, fontWeight: "700" }}
        >
          {info.apr}% APY
        </Text>
      </View>

      {/* BALANCES */}
      <View
        style={{
          backgroundColor: "#0f172a",
          borderRadius: 16,
          padding: 16,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: "rgba(148,163,184,0.4)",
        }}
      >
        <Text style={{ color: "#9ca3af" }}>Staked</Text>
        <Text style={{ color: "#f9fafb", fontSize: 22 }}>
          {info.staked.toLocaleString("en-US")} GAD
        </Text>

        <Text style={{ color: "#9ca3af", marginTop: 12 }}>Rewards</Text>
        <Text style={{ color: "#22c55e", fontSize: 22 }}>
          {info.rewards.toLocaleString("en-US")} GAD
        </Text>

        <Pressable
          onPress={handleClaim}
          disabled={processing}
          style={{
            marginTop: 12,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: "#22c55e",
            alignItems: "center",
            opacity: processing ? 0.4 : 1,
          }}
        >
          <Text
            style={{
              color: "#0b1120",
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
          backgroundColor: "#0f172a",
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: "rgba(148,163,184,0.4)",
        }}
      >
        <TextInput
          placeholder="Amount"
          placeholderTextColor="#6b7280"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
          style={{
            backgroundColor: "#0b1120",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            color: "#f9fafb",
            marginBottom: 12,
            borderWidth: 1,
            borderColor: "#1f2937",
          }}
        />

        <Pressable
          onPress={handleStake}
          disabled={processing}
          style={{
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: "#3b82f6",
            alignItems: "center",
            marginBottom: 10,
            opacity: processing ? 0.4 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Stake</Text>
        </Pressable>

        <Pressable
          onPress={handleUnstake}
          disabled={processing}
          style={{
            paddingVertical: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#f97316",
            alignItems: "center",
            opacity: processing ? 0.4 : 1,
          }}
        >
          <Text style={{ color: "#f97316", fontWeight: "700" }}>
            Unstake
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

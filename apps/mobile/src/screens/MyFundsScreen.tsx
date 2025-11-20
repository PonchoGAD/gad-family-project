// apps/mobile/src/screens/MyFundsScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { auth, db, functions } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

type FundStatus = "active" | "completed" | "withdrawn" | "locked" | string;

type Fund = {
  id: string;
  name: string;
  token?: "points" | "GAD" | "BNB";
  // старая схема
  targetAmount?: number;
  amount?: number;
  // новая схема через Cloud Functions
  targetPoints?: number;
  currentPoints?: number;
  // lock
  unlockDate?: number | { seconds: number; [key: string]: any };
  status: FundStatus;
  createdAt?: any;
};

export default function MyFundsScreen() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState<string>("10000");
  const [token, setToken] = useState<"points" | "GAD" | "BNB">("points");

  const [creating, setCreating] = useState(false);
  const [processingFundId, setProcessingFundId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setInitialLoading(false);
      return;
    }

    const coll = collection(db, "users", uid, "funds");
    const q = query(coll, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: Fund[] = snap.docs.map((d) => {
          const v = d.data() as DocumentData;

          const targetPoints =
            typeof v.targetPoints === "number"
              ? v.targetPoints
              : typeof v.targetAmount === "number"
              ? v.targetAmount
              : 0;

          const currentPoints =
            typeof v.currentPoints === "number"
              ? v.currentPoints
              : typeof v.amount === "number"
              ? v.amount
              : 0;

          return {
            id: d.id,
            name: v.name ?? "Unnamed fund",
            token: (v.token as Fund["token"]) ?? "points",
            targetAmount: v.targetAmount ?? targetPoints,
            amount: v.amount ?? currentPoints,
            targetPoints,
            currentPoints,
            unlockDate: v.unlockDate ?? 0,
            status: (v.status as FundStatus) ?? "active",
            createdAt: v.createdAt,
          };
        });
        setFunds(items);
        setInitialLoading(false);
      },
      (err) => {
        console.log("funds snapshot error", err);
        Alert.alert("Funds", "Failed to load funds");
        setInitialLoading(false);
      }
    );

    return () => unsub();
  }, []);

  async function handleCreateFund() {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert("Funds", "No user");
        return;
      }
      const trimmed = name.trim();
      if (!trimmed) return;

      const targetNum = Number(target || "0");
      if (!targetNum || targetNum <= 0) {
        Alert.alert("Funds", "Target amount must be positive");
        return;
      }

      setCreating(true);

      // 🔥 теперь создаём фонд через Cloud Function createFund
      const callable = httpsCallable(functions, "createFund");
      await callable({
        name: trimmed,
        targetPoints: targetNum,
        // токен сейчас не используем на бэке, но можем сохранить для будущего
        token,
      });

      setName("");
      setTarget("10000");
      Alert.alert("Funds", "Fund created");
    } catch (e: any) {
      console.log("createFund error", e);
      Alert.alert("Funds", e?.message ?? "Failed to create fund");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeposit(fund: Fund, delta: number) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      if (delta <= 0) return;

      setProcessingFundId(fund.id);

      // 🔥 вместо прямого setDoc — Cloud Function depositToFund
      const callable = httpsCallable(functions, "depositToFund");
      await callable({
        fundId: fund.id,
        amountPoints: delta,
      });

      Alert.alert("Funds", "Deposit successful");
    } catch (e: any) {
      console.log("deposit error", e);
      Alert.alert("Funds", e?.message ?? "Failed to deposit");
    } finally {
      setProcessingFundId(null);
    }
  }

  function getUnlockMs(fund: Fund): number {
    const u = fund.unlockDate;
    if (typeof u === "number") return u;
    if (u && typeof u.seconds === "number") return u.seconds * 1000;
    return 0;
  }

  async function handleWithdraw(fund: Fund) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const now = Date.now();
      const unlockMs = getUnlockMs(fund);

      if (unlockMs && now < unlockMs) {
        Alert.alert("Funds", "Fund is still locked");
        return;
      }

      if (fund.status && fund.status !== "active") {
        Alert.alert("Funds", "Fund is not active");
        return;
      }

      Alert.alert(
        "Withdraw fund",
        "Return points from this fund to your balance?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Withdraw",
            style: "destructive",
            onPress: async () => {
              try {
                setProcessingFundId(fund.id);

                // 🔥 Cloud Function withdrawFund
                const callable = httpsCallable(functions, "withdrawFund");
                await callable({ fundId: fund.id });

                Alert.alert("Funds", "Fund withdrawn");
              } catch (e: any) {
                console.log("withdraw error", e);
                Alert.alert(
                  "Funds",
                  e?.message ?? "Failed to withdraw fund"
                );
              } finally {
                setProcessingFundId(null);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      console.log("withdraw outer error", e);
      Alert.alert("Funds", e?.message ?? "Failed to withdraw");
    }
  }

  function renderFundStatus(fund: Fund): string {
    const status = fund.status ?? "active";
    const unlockMs = getUnlockMs(fund);

    if (status === "withdrawn") return "Withdrawn";
    if (status === "completed") return "Completed";
    if (status === "locked") {
      if (unlockMs) {
        return "Locked until " + new Date(unlockMs).toLocaleDateString();
      }
      return "Locked";
    }

    if (unlockMs) {
      const now = Date.now();
      if (now < unlockMs) {
        return "Locked until " + new Date(unlockMs).toLocaleDateString();
      }
    }

    return "Active";
  }

  function renderFund({ item }: { item: Fund }) {
    const target =
      (item.targetPoints ?? item.targetAmount ?? 0) > 0
        ? item.targetPoints ?? item.targetAmount ?? 0
        : 0;
    const current =
      item.currentPoints ?? item.amount ?? 0 > 0
        ? item.currentPoints ?? item.amount ?? 0
        : 0;

    const progress =
      target > 0 ? Math.min(1, current / target) : 0;
    const progressPct = Math.round(progress * 100);

    const unlockMs = getUnlockMs(item);
    const unlockDateStr = unlockMs
      ? new Date(unlockMs).toLocaleDateString()
      : "—";

    const isProcessing = processingFundId === item.id;
    const statusText = renderFundStatus(item);

    return (
      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
          marginBottom: 10,
        }}
      >
        <Text style={{ color: "#f9fafb", fontWeight: "600" }}>
          {item.name}
        </Text>
        <Text style={{ color: "#9ca3af", marginTop: 4 }}>
          Token: {item.token ?? "points"} | Target:{" "}
          {target.toLocaleString("en-US")}
        </Text>
        <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
          Saved: {current.toLocaleString("en-US")} ({progressPct}%)
        </Text>
        <Text style={{ color: "#6b7280", marginTop: 2 }}>
          Unlock date: {unlockDateStr} | Status: {statusText}
        </Text>

        <View
          style={{
            height: 6,
            backgroundColor: "#1f2937",
            borderRadius: 999,
            marginTop: 8,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${progressPct}%`,
              height: "100%",
              backgroundColor: "#10b981",
            }}
          />
        </View>

        <View style={{ flexDirection: "row", marginTop: 10, gap: 8 }}>
          <Button
            title={isProcessing ? "…" : "+1000"}
            onPress={() => handleDeposit(item, 1000)}
            disabled={isProcessing}
          />
          <Button
            title={isProcessing ? "…" : "+5000"}
            onPress={() => handleDeposit(item, 5000)}
            disabled={isProcessing}
          />
          <Button
            title={isProcessing ? "…" : "Withdraw"}
            onPress={() => handleWithdraw(item)}
            disabled={isProcessing}
          />
        </View>
      </View>
    );
  }

  if (initialLoading) {
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
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>Loading funds…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#020617", padding: 16 }}>
      <Text
        style={{
          fontWeight: "700",
          fontSize: 20,
          color: "#ffffff",
          marginBottom: 12,
        }}
      >
        My Funds
      </Text>

      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
          marginBottom: 16,
        }}
      >
        <Text style={{ color: "#e5e7eb", fontWeight: "600" }}>
          Create new fund
        </Text>

        <TextInput
          placeholder="Fund name (PlayStation, Car, ...)"
          placeholderTextColor="#6b7280"
          value={name}
          onChangeText={setName}
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: "#374151",
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: "#f9fafb",
          }}
        />

        <TextInput
          placeholder="Target amount (points)"
          placeholderTextColor="#6b7280"
          value={target}
          onChangeText={setTarget}
          keyboardType="numeric"
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: "#374151",
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: "#f9fafb",
          }}
        />

        <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
          MVP: token = points, unlock in 90 days handled on server. Готово к
          расширению под GAD/BNB и кастомные сроки.
        </Text>

        <View style={{ marginTop: 8 }}>
          <Button
            title={creating ? "Creating..." : "Create fund"}
            onPress={handleCreateFund}
            disabled={creating || !name.trim()}
          />
        </View>
      </View>

      <FlatList
        data={funds}
        keyExtractor={(f) => f.id}
        renderItem={renderFund}
        ListEmptyComponent={
          <Text style={{ color: "#6b7280" }}>No funds yet.</Text>
        }
      />
    </View>
  );
}

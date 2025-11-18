// apps/mobile/src/screens/MyFundsScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { auth, db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

type FundStatus = "active" | "completed" | "withdrawn";

type Fund = {
  id: string;
  name: string;
  token: "points" | "GAD" | "BNB";
  targetAmount: number;
  amount: number;
  unlockDate: number;
  status: FundStatus;
  createdAt?: any;
};

export default function MyFundsScreen() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState<string>("10000");
  const [token, setToken] = useState<"points" | "GAD" | "BNB">("points");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const coll = collection(db, "users", uid, "funds");
    const unsub = onSnapshot(coll, (snap) => {
      const items: Fund[] = snap.docs.map((d) => {
        const v = d.data() as any;
        return {
          id: d.id,
          name: v.name,
          token: v.token ?? "points",
          targetAmount: v.targetAmount ?? 0,
          amount: v.amount ?? 0,
          unlockDate: v.unlockDate ?? 0,
          status: v.status ?? "active",
          createdAt: v.createdAt,
        };
      });
      setFunds(items);
    });

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

      setLoading(true);

      const now = Date.now();
      const unlockDate = now + 90 * 24 * 60 * 60 * 1000; // 90 дней, MVP

      const ref = doc(collection(db, "users", uid, "funds"));

      await setDoc(ref, {
        name: trimmed,
        token,
        targetAmount: targetNum,
        amount: 0,
        unlockDate,
        status: "active",
        createdAt: serverTimestamp(),
      });

      setName("");
      setTarget("10000");
    } catch (e: any) {
      console.log("createFund error", e);
      Alert.alert("Funds", e?.message ?? "Failed to create fund");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeposit(fund: Fund, delta: number) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      if (delta <= 0) return;

      const newAmount = (fund.amount ?? 0) + delta;

      await setDoc(
        doc(db, "users", uid, "funds", fund.id),
        { amount: newAmount },
        { merge: true }
      );
    } catch (e: any) {
      console.log("deposit error", e);
      Alert.alert("Funds", e?.message ?? "Failed to deposit");
    }
  }

  async function handleWithdraw(fund: Fund) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const now = Date.now();
      if (now < fund.unlockDate) {
        Alert.alert("Funds", "Fund is still locked");
        return;
      }

      if (fund.status !== "active") {
        Alert.alert("Funds", "Fund is not active");
        return;
      }

      await setDoc(
        doc(db, "users", uid, "funds", fund.id),
        { status: "withdrawn" },
        { merge: true }
      );

      Alert.alert("Funds", "Fund marked as withdrawn (MVP)");
    } catch (e: any) {
      console.log("withdraw error", e);
      Alert.alert("Funds", e?.message ?? "Failed to withdraw");
    }
  }

  function renderFund({ item }: { item: Fund }) {
    const progress =
      item.targetAmount > 0 ? Math.min(1, item.amount / item.targetAmount) : 0;
    const progressPct = Math.round(progress * 100);

    const unlockDateStr = new Date(item.unlockDate).toLocaleDateString();

    return (
      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
          marginBottom: 10,
        }}
      >
        <Text style={{ color: "#f9fafb", fontWeight: "600" }}>{item.name}</Text>
        <Text style={{ color: "#9ca3af", marginTop: 4 }}>
          Token: {item.token} | Target: {item.targetAmount.toLocaleString("en-US")}
        </Text>
        <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
          Saved: {item.amount.toLocaleString("en-US")} ({progressPct}%)
        </Text>
        <Text style={{ color: "#6b7280", marginTop: 2 }}>
          Unlock date: {unlockDateStr} | Status: {item.status}
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
          <Button title="+1000" onPress={() => handleDeposit(item, 1000)} />
          <Button title="+5000" onPress={() => handleDeposit(item, 5000)} />
          <Button title="Withdraw" onPress={() => handleWithdraw(item)} />
        </View>
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
          MVP: token = points, unlock in 90 days. Позже добавим токены GAD/BNB и
          выбор даты.
        </Text>

        <View style={{ marginTop: 8 }}>
          <Button
            title={loading ? "Creating..." : "Create fund"}
            onPress={handleCreateFund}
            disabled={loading || !name.trim()}
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

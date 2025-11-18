// apps/mobile/src/screens/ExchangeFundScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { fn } from "../lib/functionsClient";

type LimitsResponse = {
  ok: boolean;
  limitPoints: number;
  usedPoints: number;
};

type RequestExchangeResponse = {
  ok: boolean;
  rid: string;
};

export default function ExchangeFundScreen() {
  const [pointsBalance, setPointsBalance] = useState<number>(0);
  const [limitPoints, setLimitPoints] = useState<number>(0);
  const [usedPoints, setUsedPoints] = useState<number>(0);
  const [amountStr, setAmountStr] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const available = Math.max(
    0,
    Math.min(pointsBalance, limitPoints - usedPoints)
  );

  async function load() {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error("No user");
      }

      // 1) Points balance
      const bSnap = await getDoc(doc(db, "balances", uid));
      const bData = (bSnap.data() || {}) as any;
      setPointsBalance(bData.pointsTotal ?? 0);

      // 2) Limits from backend
      const callLimits = fn<{}, LimitsResponse>("getExchangeLimits");
      const res = await callLimits({});
      const data = res.data;

      if (data.ok) {
        setLimitPoints(data.limitPoints);
        setUsedPoints(data.usedPoints);
      }
    } catch (e: any) {
      console.log("ExchangeFund load error", e);
      Alert.alert("Exchange Fund", e?.message ?? "Failed to load limits");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit() {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert("Exchange Fund", "No user");
        return;
      }

      const num = Number(amountStr.replace(",", "."));
      if (!num || num <= 0) {
        Alert.alert("Exchange Fund", "Enter valid amount");
        return;
      }

      if (num > available) {
        Alert.alert(
          "Exchange Fund",
          "Amount exceeds your available monthly or balance limit."
        );
        return;
      }

      setSubmitting(true);

      const callReq = fn<{ points: number }, RequestExchangeResponse>(
        "requestExchange"
      );

      const res = await callReq({ points: num });
      const data = res.data;

      if (!data.ok) {
        throw new Error("Failed to create exchange request");
      }

      Alert.alert(
        "Exchange Fund",
        "Your request has been created and will be processed in the weekly payout."
      );
      setAmountStr("");
      await load();
    } catch (e: any) {
      console.log("ExchangeFund submit error", e);
      Alert.alert("Exchange Fund", e?.message ?? "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0b0f17",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#9ca3af" }}>Loading…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0b0f17" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, padding: 16 }}>
        <Text
          style={{
            fontWeight: "700",
            fontSize: 20,
            color: "#fff",
            marginBottom: 12,
          }}
        >
          Exchange Fund (GAD → USDT)
        </Text>

        <View
          style={{
            backgroundColor: "#111827",
            padding: 12,
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: "#e5e7eb" }}>
            Points balance: {pointsBalance.toLocaleString("en-US")}
          </Text>
          <Text style={{ color: "#9ca3af", marginTop: 4 }}>
            Monthly limit: {limitPoints.toLocaleString("en-US")} pts
          </Text>
          <Text style={{ color: "#9ca3af" }}>
            Already used: {usedPoints.toLocaleString("en-US")} pts
          </Text>
          <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
            Available this month: {available.toLocaleString("en-US")} pts
          </Text>
        </View>

        <View
          style={{
            backgroundColor: "#111827",
            padding: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#e5e7eb", marginBottom: 4 }}>
            Amount to exchange (points)
          </Text>
          <TextInput
            placeholder="10000"
            placeholderTextColor="#6b7280"
            keyboardType="numeric"
            value={amountStr}
            onChangeText={setAmountStr}
            style={{
              borderWidth: 1,
              borderColor: "#374151",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: "#F9FAFB",
              marginBottom: 8,
            }}
          />

          <Text style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
            Requests are processed in the weekly payout and converted to USDT to
            your configured wallet.
          </Text>

          <Button
            title={submitting ? "Submitting…" : "Exchange to USDT"}
            onPress={handleSubmit}
            disabled={submitting || available <= 0}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

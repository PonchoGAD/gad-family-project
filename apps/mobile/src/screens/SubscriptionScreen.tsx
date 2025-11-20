// apps/mobile/src/screens/SubscriptionScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { auth, db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { fn } from "../lib/functionsClient";

type PlanId = "basic" | "family" | "pro";

type PlanCfg = {
  id: PlanId;
  label: string;
  monthlyGasWei: number;
  maxSteps: number;
  mult: number;
};

type SubscriptionConfigResponse = {
  ok: boolean;
  plans: Record<PlanId, PlanCfg>;
};

type GasHistoryItem = {
  id: string;
  amountWei: number;
  tier?: string;
  createdAt?: any;
};

export default function SubscriptionScreen() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Record<PlanId, PlanCfg> | null>(null);
  const [currentTier, setCurrentTier] = useState<PlanId | null>(null);
  const [gasCreditWei, setGasCreditWei] = useState<number>(0);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [gasHistory, setGasHistory] = useState<GasHistoryItem[]>([]);

  async function load() {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error("No user");
      }

      // 1) User profile
      const uSnap = await getDoc(doc(db, "users", uid));
      const uData = (uSnap.data() || {}) as any;
      const tier = (uData.subscription as PlanId | undefined) ?? "basic";
      setCurrentTier(tier);
      setFamilyId(uData.familyId ?? null);

      // 2) Gas credit
      const gasCredit =
        typeof uData.gasCreditWei === "number" ? uData.gasCreditWei : 0;
      setGasCreditWei(gasCredit);

      // 3) Gas stipend history (gasStipend/{uid}/items, последние 10)
      const histRef = collection(db, "gasStipend", uid, "items");
      const qHist = query(histRef, orderBy("createdAt", "desc"), limit(10));
      const histSnap = await getDocs(qHist);
      const histItems: GasHistoryItem[] = histSnap.docs.map((d) => {
        const v = d.data() as any;
        return {
          id: d.id,
          amountWei:
            typeof v.amountWei === "number"
              ? v.amountWei
              : Number(v.amountWei ?? 0),
          tier: v.tier,
          createdAt: v.createdAt,
        };
      });
      setGasHistory(histItems);

      // 4) Plans from backend
      const callCfg = fn<{}, SubscriptionConfigResponse>(
        "getSubscriptionConfig"
      );
      const res = await callCfg({});
      const data = res.data;

      if (!data.ok) {
        throw new Error("Failed to load plans");
      }
      setPlans(data.plans);
    } catch (e: any) {
      console.log("SubscriptionScreen load error", e);
      Alert.alert(
        "Subscriptions",
        e?.message ?? "Failed to load subscriptions"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function formatWeiToBNB(wei: number) {
    if (!wei) return "0";
    const bnb = wei / 1e18;
    return bnb.toFixed(4);
  }

  function formatDate(value: any) {
    if (!value) return "—";
    try {
      if (typeof value.toDate === "function") {
        return value.toDate().toLocaleString();
      }
      if (typeof value.seconds === "number") {
        return new Date(value.seconds * 1000).toLocaleString();
      }
    } catch {
      // ignore
    }
    return "—";
  }

  async function handleChangeTier(planId: PlanId) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert("Subscriptions", "No user");
        return;
      }

      if (!familyId) {
        Alert.alert(
          "Subscriptions",
          "You need a family to attach your subscription."
        );
        return;
      }

      if (planId === currentTier) {
        Alert.alert("Subscriptions", "You already use this plan");
        return;
      }

      const call = fn<
        { tier: PlanId; fid: string },
        { ok: boolean; tier: PlanId }
      >("setSubscriptionTier");

      const res = await call({ tier: planId, fid: familyId });
      const data = res.data;

      if (!data.ok) {
        throw new Error("Failed to update subscription");
      }

      setCurrentTier(data.tier);
      Alert.alert(
        "Subscriptions",
        `Plan updated to ${data.tier.toUpperCase()}`
      );
    } catch (e: any) {
      console.log("Change tier error", e);
      Alert.alert("Subscriptions", e?.message ?? "Failed to change plan");
    }
  }

  if (loading || !plans) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0b0f17",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator />
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  const ordered: PlanCfg[] = [plans.basic, plans.family, plans.pro];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0b0f17" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text
        style={{
          fontWeight: "700",
          fontSize: 20,
          color: "#fff",
          marginBottom: 12,
        }}
      >
        Subscriptions & Gas Stipend
      </Text>

      <Text style={{ color: "#9ca3af", marginBottom: 12 }}>
        Choose a plan that fits your family. Higher tiers unlock more daily
        steps, better multipliers and monthly gas support in BNB.
      </Text>

      {/* Текущий план + Gas Balance */}
      <View
        style={{
          backgroundColor: "#111827",
          padding: 12,
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: "#e5e7eb", fontWeight: "600" }}>
          Your current plan:{" "}
          {currentTier ? currentTier.toUpperCase() : "UNKNOWN"}
        </Text>
        <Text style={{ color: "#9ca3af", marginTop: 4 }}>
          Gas Balance (BNB for fees): {formatWeiToBNB(gasCreditWei)} BNB
        </Text>
      </View>

      {/* История пополнений gasStipend */}
      <View
        style={{
          backgroundColor: "#111827",
          padding: 12,
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <Text
          style={{
            color: "#e5e7eb",
            fontWeight: "600",
            marginBottom: 6,
          }}
        >
          Gas stipend history
        </Text>

        {gasHistory.length === 0 ? (
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            No gas top-ups yet.
          </Text>
        ) : (
          gasHistory.map((item) => (
            <View
              key={item.id}
              style={{
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(31,41,55,0.7)",
              }}
            >
              <Text style={{ color: "#e5e7eb", fontSize: 13 }}>
                +{formatWeiToBNB(item.amountWei)} BNB{" "}
                {item.tier ? `(${item.tier.toUpperCase()})` : ""}
              </Text>
              <Text style={{ color: "#6b7280", fontSize: 11 }}>
                {formatDate(item.createdAt)}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Планы подписок */}
      {ordered.map((plan) => {
        const isCurrent = plan.id === currentTier;
        return (
          <View
            key={plan.id}
            style={{
              backgroundColor: "#111827",
              padding: 12,
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 18,
                fontWeight: "700",
                marginBottom: 4,
              }}
            >
              {plan.label}
            </Text>
            <Text style={{ color: "#9ca3af" }}>
              Max steps/day: {plan.maxSteps.toLocaleString("en-US")}
            </Text>
            <Text style={{ color: "#9ca3af" }}>
              Multiplier: x{plan.mult.toFixed(2)}
            </Text>
            <Text style={{ color: "#9ca3af" }}>
              Monthly gas stipend: {formatWeiToBNB(plan.monthlyGasWei)} BNB
            </Text>

            <View style={{ marginTop: 8 }}>
              <Button
                title={isCurrent ? "Current plan" : "Switch to this plan"}
                onPress={() => handleChangeTier(plan.id)}
                disabled={isCurrent}
              />
            </View>
          </View>
        );
      })}

      <Text
        style={{
          color: "#6b7280",
          fontSize: 12,
          marginTop: 12,
        }}
      >
        Payments / billing integration will be added later. For now, plan
        switching is for early access and internal testing.
      </Text>
    </ScrollView>
  );
}

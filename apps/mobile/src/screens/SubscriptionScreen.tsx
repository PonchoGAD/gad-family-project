// ---------------------------------------------------------------
// apps/mobile/src/screens/SubscriptionScreen.tsx
// Subscriptions & Gas Stipend
// - GAD UI (useTheme)
// - Поддержка DemoContext (демо-планы, демо-gas, демо-история)
// - Безопасная Firestore + Cloud Functions логика в реальном режиме
// ---------------------------------------------------------------

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
import { useTheme } from "../wallet/ui/theme";
import { useActiveFamilyId, useIsDemo } from "../demo/DemoContext";

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
  const G = useTheme();
  const isDemo = useIsDemo();
  const { fid: ctxFid } = useActiveFamilyId();

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Record<PlanId, PlanCfg> | null>(null);
  const [currentTier, setCurrentTier] = useState<PlanId | null>(null);
  const [gasCreditWei, setGasCreditWei] = useState<number>(0);
  const [familyId, setFamilyId] = useState<string | null>(ctxFid ?? null);
  const [gasHistory, setGasHistory] = useState<GasHistoryItem[]>([]);

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

  async function load() {
    try {
      if (isDemo) {
        // DEMO: статические планы и история для инвест-презентации
        const demoPlans: Record<PlanId, PlanCfg> = {
          basic: {
            id: "basic",
            label: "Basic",
            monthlyGasWei: 0.02 * 1e18,
            maxSteps: 5_000,
            mult: 1.0,
          },
          family: {
            id: "family",
            label: "Family",
            monthlyGasWei: 0.05 * 1e18,
            maxSteps: 10_000,
            mult: 1.5,
          },
          pro: {
            id: "pro",
            label: "Pro+",
            monthlyGasWei: 0.12 * 1e18,
            maxSteps: 20_000,
            mult: 2.0,
          },
        };

        setPlans(demoPlans);
        setCurrentTier("family");
        setFamilyId("demo-family");

        const now = Date.now();
        setGasCreditWei(0.0834 * 1e18);
        setGasHistory([
          {
            id: "demo-1",
            amountWei: 0.03 * 1e18,
            tier: "family",
            createdAt: {
              seconds: Math.floor((now - 1000 * 60 * 60 * 24) / 1000),
            },
          },
          {
            id: "demo-2",
            amountWei: 0.02 * 1e18,
            tier: "basic",
            createdAt: {
              seconds: Math.floor((now - 1000 * 60 * 60 * 24 * 7) / 1000),
            },
          },
        ]);

        setLoading(false);
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error("No user");
      }

      // 1) User profile
      const uSnap = await getDoc(doc(db, "users", uid));
      const uData = (uSnap.data() || {}) as any;
      const tier = (uData.subscription as PlanId | undefined) ?? "basic";
      setCurrentTier(tier);
      setFamilyId(uData.familyId ?? ctxFid ?? null);

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

      if (!data?.ok) {
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
  }, [isDemo, ctxFid]);

  async function handleChangeTier(planId: PlanId) {
    try {
      if (isDemo) {
        setCurrentTier(planId);
        Alert.alert(
          "Subscriptions (demo)",
          `Plan switched to ${planId.toUpperCase()} (demo only).`
        );
        return;
      }

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

      if (!data?.ok) {
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
          backgroundColor: G.colors.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={G.colors.accent} />
        <Text style={{ color: G.colors.textMuted, marginTop: 8 }}>
          Loading…
        </Text>
      </View>
    );
  }

  const ordered: PlanCfg[] = [plans.basic, plans.family, plans.pro];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: G.colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text
        style={{
          fontWeight: "700",
          fontSize: 20,
          color: G.colors.text,
          marginBottom: 4,
        }}
      >
        Subscriptions & Gas Stipend{isDemo ? " (demo)" : ""}
      </Text>

      <Text
        style={{
          color: G.colors.textMuted,
          marginBottom: 12,
          fontSize: 13,
        }}
      >
        Choose a plan that fits your family. Higher tiers unlock more daily
        steps, better multipliers for GAD Points and monthly gas support in BNB.
      </Text>

      {/* Current plan + Gas Balance */}
      <View
        style={{
          backgroundColor: G.colors.card,
          padding: 12,
          borderRadius: 16,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text
          style={{
            color: G.colors.text,
            fontWeight: "600",
            marginBottom: 4,
          }}
        >
          Your current plan:{" "}
          {currentTier ? currentTier.toUpperCase() : "UNKNOWN"}
        </Text>
        <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
          Gas Balance (BNB for fees): {formatWeiToBNB(gasCreditWei)} BNB
        </Text>
        {familyId && (
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 11,
              marginTop: 4,
            }}
          >
            Linked family: {familyId}
          </Text>
        )}
      </View>

      {/* Gas stipend history */}
      <View
        style={{
          backgroundColor: G.colors.card,
          padding: 12,
          borderRadius: 16,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text
          style={{
            color: G.colors.text,
            fontWeight: "600",
            marginBottom: 6,
          }}
        >
          Gas stipend history
        </Text>

        {gasHistory.length === 0 ? (
          <Text style={{ color: G.colors.textMuted, fontSize: 12 }}>
            No gas top-ups yet.
          </Text>
        ) : (
          gasHistory.map((item) => (
            <View
              key={item.id}
              style={{
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: G.colors.border,
              }}
            >
              <Text style={{ color: G.colors.text, fontSize: 13 }}>
                +{formatWeiToBNB(item.amountWei)} BNB{" "}
                {item.tier ? `(${item.tier.toUpperCase()})` : ""}
              </Text>
              <Text style={{ color: G.colors.textMuted, fontSize: 11 }}>
                {formatDate(item.createdAt)}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Plans list */}
      {ordered.map((plan) => {
        const isCurrent = plan.id === currentTier;
        return (
          <View
            key={plan.id}
            style={{
              backgroundColor: G.colors.card,
              padding: 14,
              borderRadius: 16,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: G.colors.border,
            }}
          >
            <Text
              style={{
                color: G.colors.text,
                fontSize: 18,
                fontWeight: "700",
                marginBottom: 4,
              }}
            >
              {plan.label}
            </Text>
            <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
              Max steps/day: {plan.maxSteps.toLocaleString("en-US")}
            </Text>
            <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
              Multiplier: x{plan.mult.toFixed(2)}
            </Text>
            <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
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
          color: G.colors.textMuted,
          fontSize: 12,
          marginTop: 12,
        }}
      >
        Payments / billing integration will be added later. For now, plan
        switching is for early access, testing and internal families.
      </Text>
    </ScrollView>
  );
}

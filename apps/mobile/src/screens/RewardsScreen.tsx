// ---------------------------------------------------------------
// apps/mobile/src/screens/RewardsScreen.tsx
// Preview of GAD Points earned from steps & missions (Step Engine V2)
// GAD UI + DemoContext + безопасное чтение rewards/balances
// ---------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Button,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import { auth, db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { fn } from "../lib/functionsClient";
import { useActiveUid, useIsDemo } from "../demo/DemoContext";
import { useTheme } from "../wallet/ui/theme";

type SubscriptionTier = "free" | "plus" | "pro";

type RewardDayDoc = {
  date: string; // 'YYYY-MM-DD'
  uid: string;
  steps?: number;
  weightedSteps?: number;
  subscriptionTier?: SubscriptionTier;
  rateDay?: number;
  points?: number;
  familyShare?: number;
  personalShare?: number;
  status?: "paid" | "skipped";
  runId?: string;
  updatedAt?: any;
};

type BalanceDoc = {
  personal?: number;
  family?: number;
  totalEarned?: number;
  pointsTotal?: number; // старое поле, на всякий случай
  updatedAt?: any;
};

export default function RewardsScreen() {
  const G = useTheme();
  const isDemo = useIsDemo();
  const { uid: ctxUid } = useActiveUid();
  const uid = isDemo ? "demo-uid" : ctxUid ?? auth.currentUser?.uid ?? null;

  const [balance, setBalance] = useState<BalanceDoc | null>(null);
  const [daysDocs, setDaysDocs] = useState<RewardDayDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Вспомогательные даты (UTC, формат YYYY-MM-DD)
  const { todayStr, yesterdayStr } = useMemo(() => {
    const now = new Date();
    const todayIso = new Date(now.getTime()).toISOString().slice(0, 10);
    const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayIso = y.toISOString().slice(0, 10);

    return { todayStr: todayIso, yesterdayStr: yesterdayIso };
  }, []);

  useEffect(() => {
    let unsubBal: (() => void) | undefined;
    let unsubDays: (() => void) | undefined;

    async function initReal() {
      if (!uid) {
        setBalance(null);
        setDaysDocs([]);
        setLoading(false);
        return;
      }

      try {
        // Баланс GAD Points (V2: personal/family/totalEarned)
        const bRef = doc(db, "balances", uid);
        unsubBal = onSnapshot(
          bRef,
          (snap) => {
            if (!snap.exists()) {
              setBalance(null);
              return;
            }
            setBalance(snap.data() as BalanceDoc);
          },
          (err) => {
            console.log("Rewards balance snapshot error", err);
            setBalance(null);
          }
        );

        // Последние 30 дней по дате
        const dRef = collection(db, "rewards", uid, "days");
        const qDays = query(dRef, orderBy("date", "desc"), limit(30));
        unsubDays = onSnapshot(
          qDays,
          (qs) => {
            const rows: RewardDayDoc[] = qs.docs.map(
              (d) => d.data() as RewardDayDoc
            );
            setDaysDocs(rows);
          },
          (err) => {
            console.log("Rewards days snapshot error", err);
            setDaysDocs([]);
          }
        );
      } finally {
        setLoading(false);
      }
    }

    function initDemo() {
      // DEMO: статический баланс и несколько дней с шагами, points и family/personal share
      const demoBalance: BalanceDoc = {
        personal: 125_000,
        family: 54_000,
        totalEarned: 179_000,
        pointsTotal: 179_000,
      };

      const today = new Date();
      const mkDate = (offsetDays: number) => {
        const d = new Date(today);
        d.setDate(today.getDate() - offsetDays);
        return d.toISOString().slice(0, 10);
      };

      const demoDays: RewardDayDoc[] = [
        {
          date: mkDate(1),
          uid: "demo-uid",
          steps: 10_200,
          weightedSteps: 12_000,
          subscriptionTier: "pro",
          rateDay: 0.018,
          points: 216,
          familyShare: 130,
          personalShare: 86,
          status: "paid",
        },
        {
          date: mkDate(2),
          uid: "demo-uid",
          steps: 8_100,
          weightedSteps: 9_500,
          subscriptionTier: "plus",
          rateDay: 0.016,
          points: 152,
          familyShare: 90,
          personalShare: 62,
          status: "paid",
        },
        {
          date: mkDate(3),
          uid: "demo-uid",
          steps: 5_400,
          weightedSteps: 5_400,
          subscriptionTier: "free",
          rateDay: 0.015,
          points: 81,
          familyShare: 40,
          personalShare: 41,
          status: "paid",
        },
      ];

      setBalance(demoBalance);
      setDaysDocs(demoDays);
      setLoading(false);
    }

    if (isDemo) {
      initDemo();
    } else {
      initReal();
    }

    return () => {
      if (unsubBal) unsubBal();
      if (unsubDays) unsubDays();
    };
  }, [uid, isDemo]);

  const yesterdayReward = useMemo(() => {
    return (
      daysDocs.find((d) => d.date === yesterdayStr) ??
      (daysDocs.length > 0 ? daysDocs[0] : null)
    );
  }, [daysDocs, yesterdayStr]);

  const todayReward = useMemo(
    () => daysDocs.find((d) => d.date === todayStr) ?? null,
    [daysDocs, todayStr]
  );

  const recent7 = useMemo(() => daysDocs.slice(0, 7), [daysDocs]);

  const latestRateDay = useMemo(
    () => daysDocs[0]?.rateDay ?? 0,
    [daysDocs]
  );

  const personalBalance =
    balance?.personal ?? balance?.pointsTotal ?? 0; // fallback на старую схему
  const familyBalance = balance?.family ?? 0;
  const totalEarned =
    balance?.totalEarned ?? personalBalance + familyBalance;

  async function runDryLegacy() {
    if (isDemo) {
      Alert.alert(
        "Legacy engine (demo)",
        "In demo mode the engine is not called. In production it runs in backend on cron."
      );
      return;
    }

    try {
      const call = fn<
        unknown,
        { ok: boolean; processed: number; date: string }
      >("stepEngineRunNow");
      const res = await call({});
      console.log("runDryLegacy", res.data);
      Alert.alert(
        "Legacy engine",
        `Legacy step engine triggered for date: ${res.data.date}`
      );
    } catch (e) {
      console.log("runDryLegacy error", e);
      Alert.alert("Error", String(e));
    }
  }

  function handleClaimStub() {
    Alert.alert(
      "Claim to wallet",
      "Coming soon: GAD Points will be claimable as on-chain GAD tokens into your wallet.\n\nPart of the balance can go into Family goals (FamilyGoals) and Exchange Fund payouts."
    );
  }

  const renderDayRow = (r: RewardDayDoc) => {
    const pts = r.points ?? 0;
    const fam = r.familyShare ?? 0;
    const pers = r.personalShare ?? 0;
    const st = r.status ?? "paid";
    const steps = r.steps ?? 0;

    return (
      <View
        key={r.date}
        style={{
          marginTop: 8,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: G.colors.border,
        }}
      >
        <Text
          style={{
            color: G.colors.text,
            fontWeight: "600",
            fontSize: 14,
          }}
        >
          {r.date}{" "}
          {st === "skipped" && (
            <Text style={{ color: G.colors.textMuted, fontSize: 12 }}>
              (skipped)
            </Text>
          )}
        </Text>
        <Text
          style={{
            color: G.colors.textMuted,
            fontSize: 12,
            marginTop: 2,
          }}
        >
          Steps: {steps.toLocaleString("en-US")}
          {typeof r.weightedSteps === "number" &&
          r.weightedSteps !== steps
            ? ` • Weighted: ${r.weightedSteps.toLocaleString("en-US")}`
            : ""}
        </Text>
        <Text
          style={{
            color: G.colors.textMuted,
            fontSize: 12,
            marginTop: 2,
          }}
        >
          Points: {pts.toLocaleString("en-US")} (Family:{" "}
          {fam.toLocaleString("en-US")}, Personal:{" "}
          {pers.toLocaleString("en-US")})
        </Text>
      </View>
    );
  };

  if (loading) {
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
          Loading rewards…
        </Text>
      </View>
    );
  }

  const hasBalance = !!balance && (personalBalance > 0 || familyBalance > 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: G.colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text
        style={{
          color: G.colors.text,
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 8,
        }}
      >
        GAD Points Rewards{isDemo ? " (demo)" : ""}
      </Text>

      <Text
        style={{
          color: G.colors.textMuted,
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        Step Engine V2 converts your daily steps and family missions into GAD
        Points. Later, these points can flow into Family Missions, Family Funds
        and Exchange Fund payouts.
      </Text>

      {/* Баланс GAD Points */}
      <View
        style={{
          marginBottom: 12,
          padding: 14,
          borderRadius: 14,
          backgroundColor: G.colors.card,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text
          style={{
            color: G.colors.text,
            fontWeight: "700",
            fontSize: 18,
          }}
        >
          GAD Points balance
        </Text>

        {hasBalance ? (
          <>
            <View
              style={{
                flexDirection: "row",
                marginTop: 10,
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: G.colors.textMuted,
                    fontSize: 12,
                  }}
                >
                  Personal
                </Text>
                <Text
                  style={{
                    color: G.colors.accent,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  {personalBalance.toLocaleString("en-US")}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: G.colors.textMuted,
                    fontSize: 12,
                  }}
                >
                  Family share
                </Text>
                <Text
                  style={{
                    color: G.colors.text,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  {familyBalance.toLocaleString("en-US")}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: G.colors.textMuted,
                    fontSize: 12,
                  }}
                >
                  Total earned
                </Text>
                <Text
                  style={{
                    color: G.colors.text,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  {totalEarned.toLocaleString("en-US")}
                </Text>
              </View>
            </View>

            <Text
              style={{
                color: G.colors.textMuted,
                marginTop: 8,
                fontSize: 11,
              }}
            >
              Part of this balance can be reserved into{" "}
              <Text style={{ fontWeight: "600" }}>Family Missions</Text> or
              requested for payout via{" "}
              <Text style={{ fontWeight: "600" }}>Exchange Fund</Text>.
            </Text>
          </>
        ) : (
          <Text
            style={{
              color: G.colors.textMuted,
              marginTop: 8,
              fontSize: 13,
            }}
          >
            No GAD Points yet. Start walking and completing family missions to
            see your rewards here.
          </Text>
        )}

        {/* Claim stub */}
        <View style={{ marginTop: 10 }}>
          <Button title="Claim to wallet (stub)" onPress={handleClaimStub} />
        </View>
      </View>

      {/* RateDay / формула */}
      <View
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 12,
          backgroundColor: G.colors.card,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text
          style={{
            color: G.colors.textMuted,
            fontSize: 13,
          }}
        >
          Daily rate
        </Text>
        <Text
          style={{
            color: G.colors.text,
            fontSize: 14,
            marginTop: 4,
          }}
        >
          1 weighted step ={" "}
          <Text style={{ color: G.colors.accent, fontWeight: "600" }}>
            {latestRateDay || 0}
          </Text>{" "}
          GAD Points
        </Text>
        <Text
          style={{
            color: G.colors.textMuted,
            fontSize: 11,
            marginTop: 4,
          }}
        >
          Weighted steps учитывают подписку (Free / Plus / Pro) и параметры
          семьи, чтобы балансировать награды.
        </Text>
      </View>

      {/* Yesterday (основной акцент) */}
      <View
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 12,
          backgroundColor: G.colors.card,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text style={{ color: G.colors.textMuted }}>Yesterday rewards</Text>
        {yesterdayReward ? (
          <>
            <Text
              style={{
                color: G.colors.text,
                marginTop: 4,
                fontWeight: "600",
                fontSize: 15,
              }}
            >
              {yesterdayReward.date} •{" "}
              {(yesterdayReward.subscriptionTier || "free").toUpperCase()}
            </Text>

            <Text
              style={{
                color: G.colors.textMuted,
                marginTop: 4,
                fontSize: 13,
              }}
            >
              Steps:{" "}
              {(yesterdayReward.steps ?? 0).toLocaleString("en-US")} • Weighted:{" "}
              {(
                yesterdayReward.weightedSteps ??
                yesterdayReward.steps ??
                0
              ).toLocaleString("en-US")}
            </Text>

            <Text
              style={{
                color: G.colors.textMuted,
                marginTop: 2,
                fontSize: 13,
              }}
            >
              Rate: {yesterdayReward.rateDay ?? latestRateDay} GAD / weighted
              step
            </Text>

            <Text
              style={{
                color: G.colors.accent,
                marginTop: 6,
                fontWeight: "600",
                fontSize: 14,
              }}
            >
              Total: {(yesterdayReward.points ?? 0).toLocaleString("en-US")} GAD
              Points
            </Text>
            <Text
              style={{
                color: G.colors.textMuted,
                marginTop: 2,
                fontSize: 12,
              }}
            >
              Family:{" "}
              {(yesterdayReward.familyShare ?? 0).toLocaleString("en-US")} •
              Personal:{" "}
              {(yesterdayReward.personalShare ?? 0).toLocaleString("en-US")}
            </Text>
          </>
        ) : (
          <Text style={{ color: G.colors.textMuted, marginTop: 4 }}>
            No rewards for yesterday yet.
          </Text>
        )}
      </View>

      {/* Today (обычно пусто, т.к. cron считает "вчера") */}
      <View
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 12,
          backgroundColor: G.colors.card,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text style={{ color: G.colors.textMuted }}>Today</Text>
        {todayReward ? (
          <View>
            <Text
              style={{
                color: G.colors.text,
                marginTop: 4,
                fontWeight: "600",
                fontSize: 14,
              }}
            >
              {todayReward.date}
            </Text>
            <Text
              style={{
                color: G.colors.textMuted,
                marginTop: 4,
                fontSize: 13,
              }}
            >
              Steps:{" "}
              {(todayReward.steps ?? 0).toLocaleString("en-US")} • Points:{" "}
              {(todayReward.points ?? 0).toLocaleString("en-US")}
            </Text>
            <Text
              style={{
                color: G.colors.textMuted,
                marginTop: 2,
                fontSize: 12,
              }}
            >
              Today is usually being counted; main daily reward is shown as
              “Yesterday”.
            </Text>
          </View>
        ) : (
          <Text style={{ color: G.colors.textMuted, marginTop: 4 }}>
            Today’s reward not calculated yet.
          </Text>
        )}
      </View>

      {/* Recent days list */}
      <View
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 12,
          backgroundColor: G.colors.card,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text style={{ color: G.colors.textMuted }}>Recent days</Text>
        {recent7.length ? (
          <FlatList
            data={recent7}
            keyExtractor={(i) => i.date}
            scrollEnabled={false}
            renderItem={({ item }) => renderDayRow(item)}
          />
        ) : (
          <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
            No rewards yet
          </Text>
        )}
      </View>

      {/* Admin-стаб для ручного запуска старого движка */}
      <View style={{ marginTop: 8 }}>
        <Button
          title="Admin: trigger legacy engine (stub)"
          onPress={runDryLegacy}
        />
      </View>
    </ScrollView>
  );
}

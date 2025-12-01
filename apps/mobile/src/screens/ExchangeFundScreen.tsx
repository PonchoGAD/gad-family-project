// apps/mobile/src/screens/ExchangeFundScreen.tsx
// Exchange Fund (GAD Points → USDT preview)
// - Показывает баланс по GAD Points + месячные лимиты
// - Создание заявки на обмен (реальный режим через Cloud Function)
// - В DEMO: статические лимиты и список заявок, без обращения к backend
// - Список заявок с фильтрами All / Pending / Processed
// - Переход в FundDetailsScreen по клику

import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Button,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { auth, db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  DocumentData,
} from "firebase/firestore";
import { fn } from "../lib/functionsClient";
import { useTheme } from "../wallet/ui/theme";
import { useIsDemo } from "../demo/DemoContext";

type LimitsResponse = {
  ok: boolean;
  limitPoints: number;
  usedPoints: number;
};

type RequestExchangeResponse = {
  ok: boolean;
  rid: string;
};

type ExchangeRequest = {
  id: string;
  points?: number;
  status?: string;
  wallet?: string | null;
  ts?: { seconds: number } | number | null;
};

type FilterId = "all" | "pending" | "processed";

const STATUS_FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "processed", label: "Processed" },
];

function formatDate(ts?: { seconds: number } | number | null): string {
  if (!ts) return "—";
  if (typeof ts === "number") {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }
  if (typeof ts.seconds === "number") {
    const d = new Date(ts.seconds * 1000);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }
  return "—";
}

function statusLabel(status?: string): string {
  if (!status) return "Unknown";
  const s = String(status).toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  return status;
}

type Props = {
  navigation: any;
};

export default function ExchangeFundScreen({ navigation }: Props) {
  const G = useTheme();
  const isDemo = useIsDemo();

  const [pointsBalance, setPointsBalance] = useState<number>(0);
  const [limitPoints, setLimitPoints] = useState<number>(0);
  const [usedPoints, setUsedPoints] = useState<number>(0);
  const [amountStr, setAmountStr] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [requests, setRequests] = useState<ExchangeRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>("all");

  const available = Math.max(
    0,
    Math.min(pointsBalance, limitPoints - usedPoints)
  );

  // ----- LOAD LIMITS / BALANCE -----
  async function load() {
    try {
      if (isDemo) {
        // DEMO: статические значения для инвест-презентации
        setPointsBalance(125_000);
        setLimitPoints(50_000);
        setUsedPoints(15_000);
        return;
      }

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

      if (data?.ok) {
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
  }, [isDemo]);

  // ----- LOAD REQUESTS (LIST) -----
  useEffect(() => {
    if (isDemo) {
      // DEMO: витрина заявок
      const now = Date.now();
      setRequests([
        {
          id: "demo-1",
          points: 20_000,
          status: "pending",
          wallet: "0xDEMO1234DEMO1234DEMO1234DEMO1234DEMO1234",
          ts: now - 1000 * 60 * 60,
        },
        {
          id: "demo-2",
          points: 10_000,
          status: "approved",
          wallet: "0xDEMO1234DEMO1234DEMO1234DEMO1234DEMO1234",
          ts: now - 1000 * 60 * 60 * 24,
        },
        {
          id: "demo-3",
          points: 5_000,
          status: "rejected",
          wallet: "0xDEMO1234DEMO1234DEMO1234DEMO1234DEMO1234",
          ts: now - 1000 * 60 * 60 * 48,
        },
      ]);
      setRequestsLoading(false);
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      setRequests([]);
      setRequestsLoading(false);
      return;
    }

    const coll = collection(db, "exchangeFund", uid, "items");
    const qRef = query(coll, orderBy("ts", "desc"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr: ExchangeRequest[] = [];
        snap.forEach((d) => {
          const data = d.data() as DocumentData;
          arr.push({
            id: d.id,
            points: data.points,
            status: data.status,
            wallet: data.wallet ?? null,
            ts: data.ts ?? null,
          });
        });
        setRequests(arr);
        setRequestsLoading(false);
      },
      (err) => {
        console.error("ExchangeFund requests snapshot error", err);
        Alert.alert("Exchange Fund", "Failed to load requests");
        setRequestsLoading(false);
      }
    );

    return () => unsub();
  }, [isDemo]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (filter === "all") return true;
      const s = String(r.status ?? "").toLowerCase();
      if (filter === "pending") return s === "pending";
      if (filter === "processed") return s && s !== "pending";
      return true;
    });
  }, [requests, filter]);

  // ----- SUBMIT REQUEST -----
  async function handleSubmit() {
    try {
      if (isDemo) {
        Alert.alert(
          "Demo mode",
          "In demo mode exchange requests are not sent to backend. This is just a preview."
        );
        return;
      }

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

      if (!data?.ok) {
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: G.colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}
        <View style={{ marginBottom: 12 }}>
          <Text
            style={{
              fontWeight: "700",
              fontSize: 20,
              color: G.colors.text,
              marginBottom: 4,
            }}
          >
            Exchange Fund (GAD → USDT)
          </Text>
          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            Convert GAD Points into weekly USDT payouts to your on-chain wallet.
          </Text>
          {isDemo && (
            <Text
              style={{
                color: G.colors.accent,
                fontSize: 11,
                marginTop: 4,
              }}
            >
              Demo mode: all balances and requests are simulated.
            </Text>
          )}
        </View>

        {/* BALANCE / LIMITS CARD */}
        <View
          style={{
            backgroundColor: G.colors.card,
            padding: 14,
            borderRadius: 16,
            marginBottom: 16,
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
            Points balance
          </Text>
          <Text
            style={{
              color: G.colors.text,
              fontSize: 18,
              fontWeight: "700",
              marginTop: 2,
            }}
          >
            {pointsBalance.toLocaleString("en-US")} pts
          </Text>

          <View style={{ marginTop: 10 }}>
            <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
              Monthly limit
            </Text>
            <Text
              style={{
                color: G.colors.text,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {limitPoints.toLocaleString("en-US")} pts
            </Text>
          </View>

          <View style={{ marginTop: 6 }}>
            <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
              Already used this month
            </Text>
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 14,
              }}
            >
              {usedPoints.toLocaleString("en-US")} pts
            </Text>
          </View>

          <View style={{ marginTop: 6 }}>
            <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
              Available this month
            </Text>
            <Text
              style={{
                color: available > 0 ? G.colors.accent : G.colors.textMuted,
                fontSize: 16,
                fontWeight: "700",
              }}
            >
              {available.toLocaleString("en-US")} pts
            </Text>
          </View>
        </View>

        {/* FORM CARD */}
        <View
          style={{
            backgroundColor: G.colors.card,
            padding: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: G.colors.border,
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              color: G.colors.text,
              marginBottom: 4,
              fontWeight: "600",
              fontSize: 15,
            }}
          >
            Amount to exchange (points)
          </Text>
          <TextInput
            placeholder="10000"
            placeholderTextColor={G.colors.textMuted}
            keyboardType="numeric"
            value={amountStr}
            onChangeText={setAmountStr}
            style={{
              borderWidth: 1,
              borderColor: G.colors.border,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: G.colors.text,
              marginBottom: 8,
              backgroundColor: G.colors.bg,
            }}
          />

          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            Requests are grouped and processed in the weekly payout, converted
            to USDT and sent to your configured wallet.
          </Text>

          <Button
            title={
              submitting
                ? "Submitting…"
                : isDemo
                ? "Preview exchange (demo)"
                : "Exchange to USDT"
            }
            onPress={handleSubmit}
            disabled={submitting || available <= 0}
          />

          {available <= 0 && (
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 11,
                marginTop: 6,
              }}
            >
              No available points for exchange this month. Walk, complete
              missions and wait for the next cycle.
            </Text>
          )}
        </View>

        {/* REQUESTS LIST */}
        <View style={{ marginTop: 4 }}>
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "600",
              fontSize: 16,
              marginBottom: 8,
            }}
          >
            Exchange requests
          </Text>

          {/* Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            {STATUS_FILTERS.map((f) => {
              const isActive = filter === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    marginRight: 8,
                    backgroundColor: isActive
                      ? G.colors.accent
                      : G.colors.card,
                    borderWidth: 1,
                    borderColor: isActive
                      ? G.colors.accent
                      : G.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? "#051b0d" : G.colors.textMuted,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {requestsLoading ? (
            <View
              style={{
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              <ActivityIndicator color={G.colors.accent} />
              <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
                Loading requests…
              </Text>
            </View>
          ) : filteredRequests.length === 0 ? (
            <View
              style={{
                backgroundColor: G.colors.card,
                padding: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: G.colors.border,
              }}
            >
              <Text
                style={{
                  color: G.colors.text,
                  fontWeight: "500",
                  marginBottom: 4,
                }}
              >
                No requests yet
              </Text>
              <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
                Your exchange history will appear here after you submit your
                first request.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {filteredRequests.map((r) => {
                const status = statusLabel(r.status);
                const isPending =
                  String(r.status ?? "").toLowerCase() === "pending";
                const isApproved =
                  String(r.status ?? "").toLowerCase() === "approved";
                const isRejected =
                  String(r.status ?? "").toLowerCase() === "rejected";

                let statusColor = G.colors.textMuted;
                if (isApproved) statusColor = G.colors.accent;
                if (isRejected) statusColor = G.colors.textMuted;
                if (isPending) statusColor = G.colors.text;

                const pointsLabel =
                  typeof r.points === "number"
                    ? r.points.toLocaleString("en-US")
                    : "—";

                return (
                  <Pressable
                    key={r.id}
                    onPress={() =>
                      navigation.navigate("FundDetails", { rid: r.id })
                    }
                    style={{
                      backgroundColor: G.colors.card,
                      padding: 14,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: G.colors.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: G.colors.text,
                          fontWeight: "600",
                          fontSize: 14,
                          flex: 1,
                          marginRight: 8,
                        }}
                      >
                        {pointsLabel} GAD Points
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: G.colors.border,
                          backgroundColor: G.colors.bg,
                        }}
                      >
                        <Text
                          style={{
                            color: statusColor,
                            fontSize: 11,
                            fontWeight: "600",
                          }}
                        >
                          {status}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={{
                        color: G.colors.textMuted,
                        fontSize: 12,
                        marginBottom: 2,
                      }}
                    >
                      {formatDate(r.ts ?? null)}
                    </Text>

                    <Text
                      style={{
                        color: G.colors.textMuted,
                        fontSize: 11,
                      }}
                      numberOfLines={1}
                    >
                      Wallet: {r.wallet ?? "—"}
                    </Text>

                    <Text
                      style={{
                        color: G.colors.textMuted,
                        fontSize: 11,
                        marginTop: 6,
                      }}
                    >
                      Tap to open details
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

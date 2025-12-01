// apps/mobile/src/screens/ExchangeHistoryScreen.tsx
// Full history of Exchange Fund requests
// - GAD UI (useTheme)
// - Demo mode (статический список заявок)
// - Фильтры: All / Pending / Processed
// - Только чтение Firestore в реальном режиме

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { auth, db } from "../firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  DocumentData,
} from "firebase/firestore";
import { useTheme } from "../wallet/ui/theme";
import { useIsDemo } from "../demo/DemoContext";

type ExchangeItem = {
  id: string;
  points?: number;
  usdt?: number;
  status?: string;
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

export default function ExchangeHistoryScreen() {
  const G = useTheme();
  const isDemo = useIsDemo();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ExchangeItem[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");

  useEffect(() => {
    if (isDemo) {
      // DEMO: статическая история
      const now = Date.now();
      setItems([
        {
          id: "demo-h-1",
          points: 20_000,
          usdt: 40,
          status: "approved",
          ts: now - 1000 * 60 * 60 * 24,
        },
        {
          id: "demo-h-2",
          points: 10_000,
          usdt: 20,
          status: "pending",
          ts: now - 1000 * 60 * 60 * 6,
        },
        {
          id: "demo-h-3",
          points: 5_000,
          usdt: 10,
          status: "rejected",
          ts: now - 1000 * 60 * 60 * 48,
        },
      ]);
      setLoading(false);
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    const coll = collection(db, "exchangeFund", user.uid, "items");
    const qRef = query(coll, orderBy("ts", "desc"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr: ExchangeItem[] = [];
        snap.forEach((d) => {
          const data = d.data() as DocumentData;
          arr.push({
            id: d.id,
            points:
              typeof data.points === "number"
                ? data.points
                : Number(data.points ?? 0),
            usdt:
              typeof data.usdt === "number"
                ? data.usdt
                : Number(data.usdt ?? 0),
            status: data.status,
            ts: data.ts ?? null,
          });
        });
        setItems(arr);
        setLoading(false);
      },
      (err) => {
        console.error("exchange history error", err);
        setLoading(false);
        Alert.alert("Exchange", "Failed to load exchange history");
      }
    );

    return () => unsub();
  }, [isDemo]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (filter === "all") return true;
      const s = String(it.status ?? "").toLowerCase();
      if (filter === "pending") return s === "pending";
      if (filter === "processed") return s && s !== "pending";
      return true;
    });
  }, [items, filter]);

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
          Loading history…
        </Text>
      </View>
    );
  }

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
          marginBottom: 12,
        }}
      >
        Exchange History{isDemo ? " (demo)" : ""}
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
                backgroundColor: isActive ? G.colors.accent : G.colors.card,
                borderWidth: 1,
                borderColor: isActive ? G.colors.accent : G.colors.border,
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

      {filteredItems.length === 0 ? (
        <View
          style={{
            backgroundColor: G.colors.card,
            padding: 16,
            borderRadius: 16,
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
            No exchange history yet.
          </Text>
          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            Your past Exchange Fund requests will be shown here.
          </Text>
        </View>
      ) : (
        filteredItems.map((it) => {
          const status = statusLabel(it.status);
          const s = String(it.status ?? "").toLowerCase();
          const isPending = s === "pending";
          const isApproved = s === "approved";
          const isRejected = s === "rejected";

          let statusColor = G.colors.textMuted;
          if (isApproved) statusColor = G.colors.accent;
          if (isPending) statusColor = G.colors.text;
          if (isRejected) statusColor = G.colors.textMuted;

          const pointsLabel =
            typeof it.points === "number"
              ? it.points.toLocaleString("en-US")
              : "—";
          const usdtLabel =
            typeof it.usdt === "number"
              ? it.usdt.toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })
              : "—";

          return (
            <View
              key={it.id}
              style={{
                backgroundColor: G.colors.card,
                padding: 16,
                borderRadius: 16,
                marginBottom: 10,
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
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  {pointsLabel} pts → {usdtLabel} USDT
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
                  marginTop: 4,
                  fontSize: 12,
                }}
              >
                {formatDate(it.ts ?? null)}
              </Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

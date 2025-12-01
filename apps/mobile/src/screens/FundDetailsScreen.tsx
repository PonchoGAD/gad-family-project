// apps/mobile/src/screens/FundDetailsScreen.tsx

import React, { useEffect, useState } from "react";
import { View, Text, Alert, Button, ActivityIndicator } from "react-native";
import { RouteProp } from "@react-navigation/native";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useTheme } from "../wallet/ui/theme";
import { useIsDemo } from "../demo/DemoContext";

type RouteParams = {
  FundDetails: {
    rid: string;
  };
};

type Props = {
  route: RouteProp<RouteParams, "FundDetails">;
  navigation: any;
};

type FundItem = {
  id: string;
  points?: number;
  status?: string;
  wallet?: string | null;
  ts?: { seconds: number } | null;
};

function formatDate(ts?: { seconds: number } | null): string {
  if (!ts || typeof ts.seconds !== "number") return "—";
  const d = new Date(ts.seconds * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function statusLabel(status?: string): string {
  if (!status) return "Unknown";
  const s = String(status).toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  return status;
}

export default function FundDetailsScreen({ route, navigation }: Props) {
  const G = useTheme();
  const isDemo = useIsDemo();

  const rid = route?.params?.rid ?? "";

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<FundItem | null>(null);

  async function load() {
    try {
      if (isDemo) {
        // DEMO: витрина запроса обмена, без доступа к реальной БД
        const nowSeconds = Math.floor(Date.now() / 1000);
        const demoItem: FundItem = {
          id: rid || "demo-request",
          points: 50_000,
          status: "pending",
          wallet: "0xDEMO1234DEMO1234DEMO1234DEMO1234DEMO1234",
          ts: { seconds: nowSeconds - 3600 },
        };
        setItem(demoItem);
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("No user");
      if (!rid) throw new Error("Missing request ID");

      const ref = doc(db, "exchangeFund", uid, "items", rid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        Alert.alert("Exchange Fund", "Request not found");
        navigation.goBack();
        return;
      }

      const data = snap.data() as any;
      setItem({
        id: snap.id,
        points: data.points,
        status: data.status,
        wallet: data.wallet ?? null,
        ts: data.ts ?? null,
      });
    } catch (e: any) {
      Alert.alert("Exchange Fund", e?.message ?? "Failed to load details");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    try {
      if (isDemo) {
        Alert.alert(
          "Demo mode",
          "In demo mode you can’t delete real requests. This is just a preview."
        );
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) return;
      if (!rid) return;

      const ref = doc(db, "exchangeFund", uid, "items", rid);
      await deleteDoc(ref);

      Alert.alert("Exchange Fund", "Request deleted");
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Exchange Fund", e?.message ?? "Failed to delete");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !item) {
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

  const canDelete = (item.status ?? "").toLowerCase() === "pending";

  const pointsLabel =
    typeof item.points === "number"
      ? item.points.toLocaleString("en-US")
      : "—";

  const status = statusLabel(item.status);
  const isPending = status.toLowerCase() === "pending";
  const isApproved = status.toLowerCase() === "approved";
  const isRejected = status.toLowerCase() === "rejected";

  let statusColor = G.colors.textMuted;
  if (isApproved) statusColor = G.colors.accent;
  if (isRejected) statusColor = G.colors.textMuted;
  if (isPending) statusColor = G.colors.text;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: G.colors.bg,
        padding: 16,
      }}
    >
      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: G.colors.text,
          marginBottom: 12,
        }}
      >
        Request Details {isDemo ? "(demo)" : ""}
      </Text>

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
            color: G.colors.text,
            fontWeight: "600",
            fontSize: 14,
          }}
        >
          ID: <Text style={{ color: G.colors.textMuted }}>{item.id}</Text>
        </Text>

        <Text
          style={{
            color: G.colors.textMuted,
            marginTop: 8,
            fontSize: 13,
          }}
        >
          Points requested
        </Text>
        <Text
          style={{
            color: G.colors.accent,
            fontSize: 18,
            fontWeight: "700",
          }}
        >
          {pointsLabel} GAD Points
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 13,
              }}
            >
              Status
            </Text>
            <View
              style={{
                marginTop: 4,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                alignSelf: "flex-start",
                borderWidth: 1,
                borderColor: G.colors.border,
                backgroundColor: G.colors.bg,
              }}
            >
              <Text
                style={{
                  color: statusColor,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {status}
              </Text>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 13,
              }}
            >
              Date
            </Text>
            <Text
              style={{
                color: G.colors.text,
                marginTop: 4,
                fontSize: 12,
              }}
            >
              {formatDate(item.ts ?? null)}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 13,
            }}
          >
            Wallet
          </Text>
          <Text
            selectable
            style={{
              color: G.colors.text,
              marginTop: 4,
              fontSize: 12,
            }}
          >
            {item.wallet ?? "—"}
          </Text>
        </View>

        {isDemo && (
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 11,
              marginTop: 10,
            }}
          >
            Demo mode: this request is simulated and not stored on-chain or in
            the real database.
          </Text>
        )}
      </View>

      {canDelete && !isDemo && (
        <View style={{ marginBottom: 12 }}>
          <Button title="Delete request" color="#ef4444" onPress={handleDelete} />
        </View>
      )}

      {isDemo && (
        <Text
          style={{
            color: G.colors.textMuted,
            fontSize: 12,
          }}
        >
          In the full version, you will be able to cancel pending requests
          before they are processed by the family owner or system.
        </Text>
      )}
    </View>
  );
}

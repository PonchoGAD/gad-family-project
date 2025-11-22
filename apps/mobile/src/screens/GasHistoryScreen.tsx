// apps/mobile/src/screens/GasHistoryScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { auth, db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  DocumentData,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

type GasHistoryItem = {
  id: string;
  amountWei?: number;
  tier?: string;
  createdAt?: { seconds: number } | number;
};

function formatWeiToBNB(wei?: number): string {
  if (!wei) return "0";
  const bnb = wei / 1e18;
  return bnb.toFixed(6);
}

function formatDate(ts?: { seconds: number } | number): string {
  if (!ts) return "—";
  if (typeof ts === "number") {
    return new Date(ts).toLocaleString();
  }
  if (typeof ts.seconds === "number") {
    return new Date(ts.seconds * 1000).toLocaleString();
  }
  return "—";
}

export default function GasHistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<GasHistoryItem[]>([]);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      try {
        let user = auth.currentUser;
        if (!user) {
          const res = await signInAnonymously(auth);
          user = res.user;
        }

        const ref = collection(db, "gasStipend", user.uid, "items");
        const q = query(ref, orderBy("createdAt", "desc"));

        unsub = onSnapshot(
          q,
          (snap) => {
            const out: GasHistoryItem[] = [];
            snap.forEach((docSnap) => {
              const data = docSnap.data() as DocumentData;
              out.push({
                id: docSnap.id,
                amountWei: Number(data.amountWei ?? 0) || 0,
                tier: data.tier,
                createdAt: data.createdAt,
              });
            });
            setItems(out);
            setLoading(false);
          },
          (err) => {
            console.error("gas history error", err);
            Alert.alert("Gas History", "Failed to load gas history");
            setLoading(false);
          }
        );
      } catch (e) {
        console.log("GasHistoryScreen init error", e);
        Alert.alert("Gas History", "Failed to initialize gas history");
        setLoading(false);
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  if (loading) {
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
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#020617" }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.3)",
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: "#f9fafb",
            marginBottom: 4,
          }}
        >
          Gas Balance History
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 13 }}>
          Monthly gas stipends in BNB credited to your account.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 ? (
          <View
            style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor: "#0f172a",
            }}
          >
            <Text
              style={{
                color: "#e5e7eb",
                fontWeight: "500",
                marginBottom: 4,
              }}
            >
              No gas stipends yet
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 13 }}>
              Once your subscription plan includes monthly gas support, every
              stipend will appear here.
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <View
              key={item.id}
              style={{
                padding: 12,
                borderRadius: 12,
                backgroundColor: "#0b1120",
                marginBottom: 8,
                borderWidth: 1,
                borderColor: "rgba(31,41,55,0.9)",
              }}
            >
              <Text
                style={{
                  color: "#f9fafb",
                  fontWeight: "600",
                }}
              >
                +{formatWeiToBNB(item.amountWei)} BNB
              </Text>
              <Text
                style={{
                  color: "#9ca3af",
                  fontSize: 13,
                  marginTop: 2,
                }}
              >
                Plan: {(item.tier ?? "unknown").toString().toUpperCase()}
              </Text>
              <Text
                style={{
                  color: "#6b7280",
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                {formatDate(item.createdAt)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

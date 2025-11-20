// apps/mobile/src/screens/BadgesScreen.tsx

import React, { useEffect, useState, useMemo } from "react";
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

type Badge = {
  id: string;
  type?: string; // "steps" | "tasks" | "geo" | "ai" | "streak" | ...
  level?: number;
  title?: string;
  earnedAt?: { seconds: number } | number;
  locked?: boolean;
  meta?: Record<string, any>;
};

const BADGE_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "steps", label: "Steps" },
  { id: "tasks", label: "Tasks" },
  { id: "geo", label: "Geo" },
  { id: "ai", label: "AI" },
  { id: "streak", label: "Streak" },
];

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

export default function BadgesScreen() {
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const coll = collection(db, "users", user.uid, "badges");
    const q = query(coll, orderBy("earnedAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: Badge[] = [];
        snap.forEach((d) => {
          const data = d.data() as DocumentData;
          arr.push({
            id: d.id,
            ...data,
          });
        });
        setBadges(arr);
        setLoading(false);
      },
      (err) => {
        console.error("Badges snapshot error", err);
        Alert.alert("Badges", "Failed to load badges");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filteredBadges = useMemo(() => {
    if (filter === "all") return badges;
    return badges.filter((b) => (b.type || "") === filter);
  }, [badges, filter]);

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
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>
          Loading badges…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#020617" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          color: "#f9fafb",
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 12,
        }}
      >
        Badges
      </Text>

      {/* Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
      >
        {BADGE_FILTERS.map((f) => {
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
                backgroundColor: isActive ? "#3b82f6" : "#0f172a",
                borderWidth: 1,
                borderColor: isActive
                  ? "rgba(96,165,250,0.9)"
                  : "rgba(31,41,55,0.9)",
              }}
            >
              <Text
                style={{
                  color: isActive ? "#f9fafb" : "#9ca3af",
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

      {/* Grid / list of badges */}
      {filteredBadges.length === 0 ? (
        <View
          style={{
            backgroundColor: "#0f172a",
            padding: 16,
            borderRadius: 16,
          }}
        >
          <Text
            style={{
              color: "#e5e7eb",
              fontWeight: "500",
              marginBottom: 4,
            }}
          >
            No badges yet
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            Walk, complete tasks, explore geo-events and use the assistant to
            start earning badges.
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {filteredBadges.map((b) => {
            const locked = !!b.locked;
            const badgeType = b.type ?? "generic";

            return (
              <View
                key={b.id}
                style={{
                  width: "48%",
                  backgroundColor: "#0f172a",
                  borderRadius: 16,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: locked
                    ? "rgba(75,85,99,0.8)"
                    : "rgba(96,165,250,0.9)",
                  opacity: locked ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: locked ? "#6b7280" : "#f9fafb",
                    fontWeight: "700",
                    fontSize: 14,
                    marginBottom: 4,
                  }}
                  numberOfLines={2}
                >
                  {b.title || "Badge"}
                </Text>

                <Text
                  style={{
                    color: "#9ca3af",
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  Type: {badgeType}
                  {typeof b.level === "number" ? ` • Lv.${b.level}` : ""}
                </Text>

                <Text
                  style={{
                    color: "#6b7280",
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  {locked ? "Locked" : `Earned: ${formatDate(b.earnedAt)}`}
                </Text>

                {b.meta?.steps && (
                  <Text style={{ color: "#9ca3af", fontSize: 11 }}>
                    Steps: {b.meta.steps.toLocaleString("en-US")}
                  </Text>
                )}
                {b.meta?.tasks && (
                  <Text style={{ color: "#9ca3af", fontSize: 11 }}>
                    Tasks: {b.meta.tasks.toLocaleString("en-US")}
                  </Text>
                )}
                {b.meta?.geoEvents && (
                  <Text style={{ color: "#9ca3af", fontSize: 11 }}>
                    Geo events: {b.meta.geoEvents}
                  </Text>
                )}
                {b.meta?.aiCalls && (
                  <Text style={{ color: "#9ca3af", fontSize: 11 }}>
                    AI calls: {b.meta.aiCalls}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

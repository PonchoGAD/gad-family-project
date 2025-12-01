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
import { useTheme } from "../wallet/ui/theme";
import { useActiveUid, useIsDemo } from "../demo/DemoContext";

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
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }
  if (typeof ts.seconds === "number") {
    const d = new Date(ts.seconds * 1000);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }
  return "—";
}

export default function BadgesScreen() {
  const G = useTheme();
  const { uid: ctxUid } = useActiveUid();
  const isDemo = useIsDemo();

  const uid = ctxUid ?? auth.currentUser?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    // DEMO: витрина бейджей, вообще без Firestore
    if (isDemo) {
      const now = Date.now();
      setBadges([
        {
          id: "demo-steps-1",
          type: "steps",
          level: 1,
          title: "First 5,000 steps",
          earnedAt: now - 1000 * 60 * 60 * 24,
          locked: false,
          meta: { steps: 5_000 },
        },
        {
          id: "demo-steps-2",
          type: "steps",
          level: 2,
          title: "10,000 steps day",
          earnedAt: now - 1000 * 60 * 60 * 48,
          locked: false,
          meta: { steps: 10_000 },
        },
        {
          id: "demo-tasks-1",
          type: "tasks",
          level: 1,
          title: "Family Tasks Starter",
          earnedAt: now - 1000 * 60 * 60 * 72,
          locked: false,
          meta: { tasks: 3 },
        },
        {
          id: "demo-geo-1",
          type: "geo",
          level: 1,
          title: "Safe Zone Explorer",
          earnedAt: now - 1000 * 60 * 60 * 96,
          locked: false,
          meta: { geoEvents: 2 },
        },
        {
          id: "demo-ai-1",
          type: "ai",
          level: 1,
          title: "Asked AI for help",
          earnedAt: now - 1000 * 60 * 60 * 120,
          locked: false,
          meta: { aiCalls: 1 },
        },
        {
          id: "demo-streak-1",
          type: "streak",
          level: 1,
          title: "3-day streak",
          earnedAt: now - 1000 * 60 * 60 * 144,
          locked: false,
        },
      ]);
      setLoading(false);
      return;
    }

    if (!uid) {
      setLoading(false);
      setBadges([]);
      return;
    }

    const coll = collection(db, "users", uid, "badges");
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
  }, [uid, isDemo]);

  const filteredBadges = useMemo(() => {
    if (filter === "all") return badges;
    return badges.filter((b) => (b.type || "") === filter);
  }, [badges, filter]);

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
          Loading badges…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: G.colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          color: G.colors.text,
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 4,
        }}
      >
        Badges {isDemo ? "(demo)" : ""}
      </Text>

      <Text
        style={{
          color: G.colors.textMuted,
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        Earn badges for walking, completing tasks, using safe zones and AI
        assistant. They visualize your family’s progress.
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

      {/* Grid / list of badges */}
      {filteredBadges.length === 0 ? (
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
              fontWeight: "500",
              marginBottom: 4,
            }}
          >
            No badges yet
          </Text>
          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            Walk, complete tasks, explore safe zones and talk to the assistant
            to start unlocking badges.
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
                  backgroundColor: G.colors.card,
                  borderRadius: 16,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: locked ? G.colors.border : G.colors.accent,
                  opacity: locked ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: locked ? G.colors.textMuted : G.colors.text,
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
                    color: G.colors.textMuted,
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  Type: {badgeType}
                  {typeof b.level === "number" ? ` • Lv.${b.level}` : ""}
                </Text>

                <Text
                  style={{
                    color: G.colors.textMuted,
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  {locked ? "Locked" : `Earned: ${formatDate(b.earnedAt)}`}
                </Text>

                {b.meta?.steps && (
                  <Text style={{ color: G.colors.textMuted, fontSize: 11 }}>
                    Steps: {b.meta.steps.toLocaleString("en-US")}
                  </Text>
                )}
                {b.meta?.tasks && (
                  <Text style={{ color: G.colors.textMuted, fontSize: 11 }}>
                    Tasks: {b.meta.tasks.toLocaleString("en-US")}
                  </Text>
                )}
                {b.meta?.geoEvents && (
                  <Text style={{ color: G.colors.textMuted, fontSize: 11 }}>
                    Geo events: {b.meta.geoEvents}
                  </Text>
                )}
                {b.meta?.aiCalls && (
                  <Text style={{ color: G.colors.textMuted, fontSize: 11 }}>
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

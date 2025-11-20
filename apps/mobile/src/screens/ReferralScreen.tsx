// apps/mobile/src/screens/ReferralScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
} from "react-native";
import { auth, db, functions } from "../firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

type ReferralItem = {
  id: string;
  newFamilyId?: string;
  refCode?: string;
  bonusPoints?: number;
  ts?: { seconds: number } | number;
};

function getAmbassadorTier(
  totalFamilies: number,
  totalBonusPoints: number
): { label: string; subtitle: string } {
  if (totalFamilies >= 20 || totalBonusPoints >= 100_000) {
    return {
      label: "Gold Ambassador",
      subtitle: "Top tier. You helped build a big part of the network.",
    };
  }
  if (totalFamilies >= 10 || totalBonusPoints >= 50_000) {
    return {
      label: "Silver Ambassador",
      subtitle: "Strong contributor. Your referrals are already a community.",
    };
  }
  if (totalFamilies >= 3 || totalBonusPoints >= 15_000) {
    return {
      label: "Bronze Ambassador",
      subtitle: "Great start. Keep inviting to unlock higher ranks.",
    };
  }
  return {
    label: "Starter",
    subtitle: "Invite your first families to unlock Ambassador ranks.",
  };
}

export default function ReferralScreen() {
  const [loading, setLoading] = useState(true);
  const [codeLoading, setCodeLoading] = useState(true);

  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);

  const [history, setHistory] = useState<ReferralItem[]>([]);
  const [totalBonusPoints, setTotalBonusPoints] = useState<number>(0);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      setCodeLoading(false);
      return;
    }

    // 1) Загружаем/генерируем реферальный код
    loadReferralCode();

    // 2) Подписываемся на историю рефералок
    const ref = collection(db, "referrals", user.uid, "items");
    const q = query(ref, orderBy("ts", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: ReferralItem[] = [];
        let sum = 0;

        snap.forEach((docSnap) => {
          const data = docSnap.data() as DocumentData;
          const bonus = Number(data.bonusPoints ?? 0) || 0;
          sum += bonus;

          out.push({
            id: docSnap.id,
            newFamilyId: data.newFamilyId,
            refCode: data.refCode,
            bonusPoints: bonus,
            ts: data.ts,
          });
        });

        setHistory(out);
        setTotalBonusPoints(sum);
        setLoading(false);
      },
      (err) => {
        console.error("referrals snapshot error", err);
        Alert.alert("Referrals", "Failed to load referrals history");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  async function loadReferralCode() {
    try {
      const user = auth.currentUser;
      if (!user) {
        setCodeLoading(false);
        return;
      }

      setCodeLoading(true);
      const callable = httpsCallable(functions, "generateReferralCode");
      const res = await callable({});
      const data = res.data as any;

      const code: string | undefined = data?.code;
      if (!code) {
        throw new Error("No referral code returned");
      }

      setReferralCode(code);
      const link = `https://gad-family.com/signup?ref=${encodeURIComponent(
        code
      )}`;
      setReferralLink(link);
    } catch (e: any) {
      console.error("generateReferralCode error", e);
      Alert.alert(
        "Referrals",
        e?.message ?? "Failed to load referral code"
      );
    } finally {
      setCodeLoading(false);
    }
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

  async function handleShare() {
    if (!referralLink) {
      Alert.alert("Referrals", "Referral link not ready yet");
      return;
    }

    try {
      await Share.share({
        message: `Join our family on GAD:\n${referralLink}`,
      });
    } catch (e: any) {
      console.error("share error", e);
      Alert.alert("Referrals", "Failed to share link");
    }
  }

  if (loading && codeLoading) {
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

  const totalFamilies = history.length;
  const ambassador = getAmbassadorTier(totalFamilies, totalBonusPoints);

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
          Referral & Ambassadors
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 13 }}>
          Invite families, grow the network and earn bonus points.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Referral code block */}
        <View
          style={{
            backgroundColor: "#0f172a",
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
          }}
        >
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
              marginBottom: 8,
              fontWeight: "500",
            }}
          >
            Your referral code
          </Text>

          {codeLoading ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: "#9ca3af", marginLeft: 8 }}>
                Generating…
              </Text>
            </View>
          ) : (
            <>
              <Text
                style={{
                  color: "#fbbf24",
                  fontSize: 22,
                  fontWeight: "800",
                  letterSpacing: 2,
                }}
              >
                {referralCode ?? "—"}
              </Text>
              <Text
                style={{
                  color: "#6b7280",
                  fontSize: 12,
                  marginTop: 6,
                }}
              >
                Share this code with families to sign up and link their account
                to you.
              </Text>
            </>
          )}

          {!codeLoading && (
            <Pressable
              onPress={loadReferralCode}
              style={{
                marginTop: 10,
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#4b5563",
              }}
            >
              <Text
                style={{
                  color: "#9ca3af",
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                Refresh code
              </Text>
            </Pressable>
          )}
        </View>

        {/* Ambassador tier block */}
        <View
          style={{
            backgroundColor: "#020617",
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "rgba(248,250,252,0.06)",
          }}
        >
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            Ambassador level
          </Text>
          <Text
            style={{
              color: "#f9fafb",
              fontSize: 18,
              fontWeight: "700",
              marginBottom: 4,
            }}
          >
            {ambassador.label}
          </Text>
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
            }}
          >
            {ambassador.subtitle}
          </Text>
        </View>

        {/* Referral link + share */}
        <View
          style={{
            backgroundColor: "#020617",
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
          }}
        >
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            Referral link
          </Text>

          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#1f2937",
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "#0b1120",
              marginBottom: 12,
            }}
          >
            <Text
              selectable
              style={{ color: "#e5e7eb", fontSize: 13 }}
              numberOfLines={2}
            >
              {referralLink ?? "Link is not ready"}
            </Text>
          </View>

          <Pressable
            onPress={handleShare}
            style={{
              borderRadius: 999,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: "#3b82f6",
              opacity: referralLink ? 1 : 0.5,
            }}
            disabled={!referralLink}
          >
            <Text
              style={{
                color: "#f9fafb",
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              Share referral link
            </Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View
          style={{
            backgroundColor: "#0f172a",
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text
              style={{
                color: "#9ca3af",
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              Invited families
            </Text>
            <Text
              style={{
                color: "#f9fafb",
                fontSize: 20,
                fontWeight: "700",
              }}
            >
              {totalFamilies}
            </Text>
          </View>

          <View>
            <Text
              style={{
                color: "#9ca3af",
                fontSize: 12,
                marginBottom: 4,
                textAlign: "right",
              }}
            >
              Total bonus points
            </Text>
            <Text
              style={{
                color: "#f9fafb",
                fontSize: 20,
                fontWeight: "700",
                textAlign: "right",
              }}
            >
              {totalBonusPoints.toLocaleString("en-US")}
            </Text>
          </View>
        </View>

        {/* History list */}
        <View
          style={{
            marginBottom: 8,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "#e5e7eb",
              fontWeight: "600",
              fontSize: 16,
            }}
          >
            Referral history
          </Text>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            Latest invitations
          </Text>
        </View>

        {history.length === 0 ? (
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
              No referrals yet
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 13 }}>
              Share your link with other families to start earning referral
              bonuses.
            </Text>
          </View>
        ) : (
          history.map((item) => (
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
                Family: {item.newFamilyId ?? "—"}
              </Text>
              <Text
                style={{
                  color: "#9ca3af",
                  fontSize: 13,
                  marginTop: 2,
                }}
              >
                Bonus:{" "}
                {(item.bonusPoints ?? 0).toLocaleString("en-US")} points
              </Text>
              <Text
                style={{
                  color: "#6b7280",
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                {formatDate(item.ts)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

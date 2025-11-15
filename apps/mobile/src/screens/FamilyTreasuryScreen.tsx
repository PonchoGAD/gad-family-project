// apps/mobile/src/screens/FamilyTreasuryScreen.tsx
import React, { useEffect, useState } from "react";
import { ScrollView, View, Text } from "react-native";
import LockTimer from "../components/LockTimer";
import ProofOfLock from "../components/ProofOfLock";

import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

type FamilyVault = {
  totalLockedPoints?: number;
  totalReleasedPoints?: number;
  lastUpdatedAt?: any;
  [key: string]: any;
};

export default function FamilyTreasuryScreen() {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [vault, setVault] = useState<FamilyVault | null>(null);
  const [loadingVault, setLoadingVault] = useState<boolean>(true);
  const [vaultError, setVaultError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Ensure user
        let user = auth.currentUser;
        if (!user) {
          const res = await signInAnonymously(auth);
          user = res.user;
        }

        // Load familyId from users/{uid}
        const uSnap = await getDoc(doc(db, "users", user.uid));
        const fid = (uSnap.data() as any)?.familyId ?? null;
        setFamilyId(fid);

        if (!fid) {
          setVault(null);
          return;
        }

        // Read FamilyVault doc: families/{fid}/vault
        const vSnap = await getDoc(doc(db, "families", fid, "vault"));
        if (vSnap.exists()) {
          setVault(vSnap.data() as any);
        } else {
          setVault(null);
        }
      } catch (e: any) {
        console.log("FamilyTreasury vault load error", e);
        setVaultError(e?.message ?? "Failed to load family vault");
      } finally {
        setLoadingVault(false);
      }
    })();
  }, []);

  const renderVaultCard = () => {
    if (!familyId && !loadingVault) {
      return (
        <View
          style={{
            borderRadius: 12,
            padding: 12,
            backgroundColor: "#111827",
            gap: 4,
          }}
        >
          <Text style={{ color: "#f9fafb", fontWeight: "600", fontSize: 16 }}>
            Family Vault
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            You are not in a family yet. Create or join a family to see your
            family vault.
          </Text>
        </View>
      );
    }

    if (loadingVault) {
      return (
        <View
          style={{
            borderRadius: 12,
            padding: 12,
            backgroundColor: "#111827",
          }}
        >
          <Text style={{ color: "#f9fafb", fontWeight: "600", fontSize: 16 }}>
            Family Vault
          </Text>
          <Text style={{ color: "#6b7280", marginTop: 4 }}>Loading…</Text>
        </View>
      );
    }

    if (vaultError) {
      return (
        <View
          style={{
            borderRadius: 12,
            padding: 12,
            backgroundColor: "#111827",
          }}
        >
          <Text style={{ color: "#f9fafb", fontWeight: "600", fontSize: 16 }}>
            Family Vault
          </Text>
          <Text style={{ color: "#f87171", marginTop: 4 }}>
            {vaultError || "Failed to load family vault"}
          </Text>
        </View>
      );
    }

    if (!vault) {
      return (
        <View
          style={{
            borderRadius: 12,
            padding: 12,
            backgroundColor: "#111827",
            gap: 4,
          }}
        >
          <Text style={{ color: "#f9fafb", fontWeight: "600", fontSize: 16 }}>
            Family Vault
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            Vault data is not initialized yet. Once your family starts earning
            and locking points, high-level stats will appear here.
          </Text>
        </View>
      );
    }

    const totalLocked =
      (vault.totalLockedPoints as number | undefined) ?? undefined;
    const totalReleased =
      (vault.totalReleasedPoints as number | undefined) ?? undefined;

    return (
      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
          gap: 4,
        }}
      >
        <Text style={{ color: "#f9fafb", fontWeight: "600", fontSize: 16 }}>
          Family Vault (beta)
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 13 }}>
          Family ID: {familyId}
        </Text>

        <View style={{ marginTop: 8 }}>
          <Text style={{ color: "#e5e7eb" }}>
            Total locked points:{" "}
            {totalLocked !== undefined ? totalLocked : "—"}
          </Text>
          <Text style={{ color: "#e5e7eb", marginTop: 2 }}>
            Total released points:{" "}
            {totalReleased !== undefined ? totalReleased : "—"}
          </Text>
        </View>

        {vault.lastUpdatedAt && (
          <Text style={{ color: "#9ca3af", fontSize: 12, marginTop: 6 }}>
            Last update:{" "}
            {typeof vault.lastUpdatedAt === "string"
              ? vault.lastUpdatedAt
              : JSON.stringify(vault.lastUpdatedAt)}
          </Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0b0c0f" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={{ gap: 16 }}>
        <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 18 }}>
          Family Treasury
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 14 }}>
          Long-term locked GAD for your family. This screen shows the global
          treasury lock schedule and public proof of lock.
        </Text>

        {/* Global project-level vesting (TeamFinance / Treasury SAFE) */}
        <LockTimer />
        <ProofOfLock />

        {/* Family-specific vault (points, future 80/20, children locks, etc.) */}
        {renderVaultCard()}
      </View>
    </ScrollView>
  );
}

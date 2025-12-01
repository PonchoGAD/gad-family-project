// apps/mobile/src/screens/FamilyTreasuryScreen.tsx

import React, { useEffect, useState } from "react";
import { ScrollView, View, Text } from "react-native";
import LockTimer from "../components/LockTimer";
import ProofOfLock from "../components/ProofOfLock";

import { auth, db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

type FamilyVault = {
  totalLockedPoints?: number;
  totalReleasedPoints?: number;
  lastUpdatedAt?: any;
  [key: string]: any;
};

type FamilyLedgerEntry = {
  id: string;
  type: string;
  date?: string;
  amount?: number;
  fromUser?: string;
  runId?: string;
  createdAt?: any;
};

export default function FamilyTreasuryScreen() {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [vault, setVault] = useState<FamilyVault | null>(null);
  const [loadingVault, setLoadingVault] = useState<boolean>(true);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const [ledger, setLedger] = useState<FamilyLedgerEntry[]>([]);

  useEffect(() => {
    (async () => {
      try {
        // Ensure user
        let user = auth.currentUser;
        if (!user) {
          const res = await signInAnonymously(auth);
          user = res.user;
        }

        // Load familyId
        const uSnap = await getDoc(doc(db, "users", user.uid));
        const fid = (uSnap.data() as any)?.familyId ?? null;
        setFamilyId(fid);

        if (!fid) {
          setVault(null);
          setLedger([]);
          return;
        }

        // families/{fid}/vault/main
        const vSnap = await getDoc(
          doc(db, "families", fid, "vault", "main")
        );

        if (vSnap.exists()) {
          setVault(vSnap.data() as any);
        } else {
          setVault(null);
        }

        setVaultError(null);
      } catch (e: any) {
        console.log("FamilyTreasury vault load error", e);
        setVaultError(e?.message ?? "Failed to load family vault");
      } finally {
        setLoadingVault(false);
      }
    })();
  }, []);

  // Подписка на ledger (steps_reward)
  useEffect(() => {
    if (!familyId) return;

    const ledgerRef = collection(
      db,
      "families",
      familyId,
      "treasury",
      "ledger"
    );

    const q = query(
      ledgerRef,
      where("type", "==", "steps_reward"),
      orderBy("date", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (qs) => {
        const rows: FamilyLedgerEntry[] = qs.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setLedger(rows);
      },
      (err) => {
        console.log("FamilyTreasury ledger error", err);
      }
    );

    return () => unsub();
  }, [familyId]);

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
            {vaultError}
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
            and locking points, statistics will appear here.
          </Text>
        </View>
      );
    }

    const totalLocked = vault.totalLockedPoints ?? "—";
    const totalReleased = vault.totalReleasedPoints ?? "—";

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
            Total locked points: {totalLocked}
          </Text>
          <Text style={{ color: "#e5e7eb", marginTop: 2 }}>
            Total released points: {totalReleased}
          </Text>
        </View>

        {vault.lastUpdatedAt && (
          <Text style={{ color: "#9ca3af", fontSize: 12, marginTop: 6 }}>
            Last update: {JSON.stringify(vault.lastUpdatedAt)}
          </Text>
        )}
      </View>
    );
  };

  const renderLedgerCard = () => {
    if (!familyId) {
      return null;
    }

    return (
      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
          marginTop: 16,
        }}
      >
        <Text style={{ color: "#f9fafb", fontWeight: "600", fontSize: 16 }}>
          Steps rewards ledger
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
          Daily family share from Step Engine V2 (type: steps_reward).
        </Text>

        {ledger.length === 0 ? (
          <Text style={{ color: "#6b7280", marginTop: 8 }}>
            No step rewards recorded yet.
          </Text>
        ) : (
          ledger.map((entry) => (
            <View
              key={entry.id}
              style={{
                marginTop: 8,
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(31,41,55,0.7)",
              }}
            >
              <Text
                style={{
                  color: "#e5e7eb",
                  fontSize: 14,
                  fontWeight: "500",
                }}
              >
                {entry.date ?? "—"} •{" "}
                {(entry.amount ?? 0).toLocaleString("en-US")} GAD Points
              </Text>
              <Text
                style={{
                  color: "#9ca3af",
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                From user: {entry.fromUser ?? "—"}
              </Text>
            </View>
          ))
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
          treasury lock schedule, public proof of lock, and step-based family
          rewards.
        </Text>

        <LockTimer />
        <ProofOfLock />

        {renderVaultCard()}
        {renderLedgerCard()}
      </View>
    </ScrollView>
  );
}

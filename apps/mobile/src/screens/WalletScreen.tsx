import { useEffect, useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { getOrCreateWallet } from "../lib/wallet";
import { getGadBalance } from "../lib/gadToken";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAge, getAgeTier } from "../lib/age";

type Tier = "child" | "teen" | "adult";

export default function WalletScreen({ navigation }: any) {
  const [addr, setAddr] = useState<string>("");
  const [bal, setBal] = useState<string>("");
  const [tier, setTier] = useState<Tier>("teen");
  const [locked, setLocked] = useState<number>(0);
  const [fid, setFid] = useState<string | null>(null);

  async function load() {
    try {
      const uid = auth.currentUser?.uid;
      let currentTier: Tier = "teen";

      if (uid) {
        const snap = await getDoc(doc(db, "users", uid));
        const data = snap.data() || {};

        const age = getAge(data.birthDate);
        currentTier = getAgeTier(age);
        setTier(currentTier);

        const familyId = data.familyId ?? null;
        setFid(familyId);

        if (familyId) {
          const lsnap = await getDoc(
            doc(db, "families", familyId, "vault", "locked", uid)
          );
          setLocked((lsnap.data()?.pointsLocked ?? 0) as number);
        } else {
          const lsnap = await getDoc(doc(db, "lockedBalances", uid));
          setLocked((lsnap.data()?.pointsLocked ?? 0) as number);
        }
      }

      // Wallet address and GAD balance (only for 14+)
      if (currentTier === "child") {
        setAddr("—");
        setBal("");
      } else {
        const w = await getOrCreateWallet();
        setAddr(w.address);

        try {
          const b = await getGadBalance(w.address as `0x${string}`);
          setBal(b.pretty);
        } catch {
          setBal("—");
        }
      }
    } catch (e: any) {
      console.error("Wallet load error", e);
      Alert.alert("Wallet", e?.message ?? "Failed to load wallet");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <View style={{ padding: 24, gap: 12, flex: 1, backgroundColor: "#0b0c0f" }}>
      <Text style={{ fontWeight: "700", fontSize: 18, color: "#fff" }}>
        Wallet
      </Text>
      <Text style={{ color: "#e5e7eb" }}>Age policy: {tier}</Text>

      {tier === "child" ? (
        <>
          <Text style={{ color: "#9ca3af", marginTop: 4 }}>
            Children under 14 don’t create wallets. Personal earnings are
            protected in the Family Vault.
          </Text>
          <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
            Locked balance: {locked.toLocaleString("en-US")} GAD Points
          </Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            <Button
              title="Open Family Treasury"
              onPress={() => navigation.navigate("FamilyTreasury")}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
            My address: {addr || "—"}
          </Text>
          <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
            GAD token balance: {bal || "—"}
          </Text>

          <View style={{ marginTop: 12, gap: 8 }}>
            <Button title="Refresh" onPress={load} />
            <Button
              title="Set up / Backup wallet"
              onPress={() => navigation.navigate("WalletOnboarding")}
            />
            <Button
              title="My NFTs"
              onPress={() => navigation.navigate("NFTs")}
            />
          </View>

          {locked > 0 && !!fid && (
            <Text style={{ color: "#6b7280", marginTop: 12 }}>
              You also have {locked.toLocaleString("en-US")} locked points (from
              child period) in the Family Vault.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

// apps/mobile/src/screens/WalletScreen.tsx
import { useEffect, useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { getOrCreateWallet } from "../lib/wallet";
import { getGadBalance } from "../lib/gadToken";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAge, getAgeTier } from "../lib/age";

type Tier = "child" | "teen" | "adult";

export default function WalletScreen({ navigation }: any) {
  const [addr, setAddr] = useState<string>("—");
  const [bal, setBal] = useState<string>("—");
  const [tier, setTier] = useState<Tier>("teen");
  const [locked, setLocked] = useState<number>(0);
  const [fid, setFid] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<string>("free");
  const [gasCredit, setGasCredit] = useState<number>(0);

  async function load() {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      const data = snap.data() || {};

      // age tier
      const age = getAge(data.birthDate);
      const currentTier = getAgeTier(age);
      setTier(currentTier);

      // subscription
      setSubscription(data.subscription ?? "free");

      // gas credit
      setGasCredit(data.gasCreditWei ?? 0);

      const familyId = data.familyId ?? null;
      setFid(familyId);

      // ✅ FIX: читаем lock из families/{fid}/vault/main/locked/{uid}
      if (familyId) {
        const lockedSnap = await getDoc(
          doc(db, "families", familyId, "vault", "main", "locked", uid)
        );
        setLocked(lockedSnap.exists() ? lockedSnap.data()?.pointsLocked ?? 0 : 0);
      } else {
        setLocked(0);
      }

      // child-tier → без кошелька
      if (currentTier === "child") {
        setAddr("—");
        setBal("—");
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
    } catch (e) {
      Alert.alert("Wallet", String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <View
      style={{
        padding: 24,
        gap: 14,
        flex: 1,
        backgroundColor: "#020617",
      }}
    >
      <Text style={{ fontWeight: "700", fontSize: 18, color: "#fff" }}>
        Wallet
      </Text>

      <Text style={{ color: "#9ca3af" }}>
        Subscription: {subscription.toUpperCase()}
      </Text>

      <Text style={{ color: "#e5e7eb" }}>Age tier: {tier}</Text>

      {tier === "child" ? (
        <>
          <Text style={{ color: "#9ca3af", marginTop: 4 }}>
            Children under 14 don’t create wallets.
          </Text>
          <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
            Locked balance: {locked.toLocaleString("en-US")} GAD Points
          </Text>
        </>
      ) : (
        <>
          <Text style={{ color: "#e5e7eb" }}>Address: {addr}</Text>
          <Text style={{ color: "#e5e7eb" }}>GAD: {bal}</Text>
        </>
      )}

      {/* Gas stipend */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
          Gas Stipend (BNB)
        </Text>
        <Text style={{ color: "#9ca3af", marginTop: 4 }}>
          Available gas credit: {gasCredit} WEI
        </Text>

        <Button
          title="View gas history"
          onPress={() => navigation.navigate("GasHistory")}
        />
      </View>

      {/* Actions */}
      {tier !== "child" && (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Button title="Refresh" onPress={load} />
          <Button
            title="Set up / Backup wallet"
            onPress={() => navigation.navigate("WalletOnboarding")}
          />
          <Button
            title="History"
            onPress={() => navigation.navigate("WalletActivity")}
          />
          <Button
            title="My NFTs"
            onPress={() => navigation.navigate("NFTGallery")}
          />
        </View>
      )}

      {/* Upgrade */}
      <Button
        title="Upgrade Subscription"
        onPress={() => navigation.navigate("Subscription")}
      />
    </View>
  );
}

import { useEffect, useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { getOrCreateWallet } from "../lib/wallet";
import { getGadBalance } from "../lib/gadToken";
import { auth, db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAge, getAgeTier } from "../lib/age";

export default function WalletScreen({ navigation }: any) {
  const [addr, setAddr] = useState<string>("");
  const [bal, setBal] = useState<string>("");
  const [tier, setTier] = useState<"child"|"teen"|"adult">("teen");
  const [locked, setLocked] = useState<number>(0);
  const [fid, setFid] = useState<string | null>(null);

  async function load() {
    try {
      // профиль
      const uid = auth.currentUser?.uid;
      if (uid) {
        const u = await getDoc(doc(db, "users", uid));
        const d = u.data() || {};
        const age = getAge(d.birthDate);
        setTier(getAgeTier(age));
        setFid(d.familyId ?? null);

        if (d.familyId) {
          const lsnap = await getDoc(doc(db, "families", d.familyId, "vault", "locked", uid));
          setLocked((lsnap.data()?.pointsLocked ?? 0) as number);
        } else {
          const lsnap = await getDoc(doc(db, "lockedBalances", uid));
          setLocked((lsnap.data()?.pointsLocked ?? 0) as number);
        }
      }

      // адрес и баланс (только 14+ создаём локальный кошелёк)
      if (tier === "child") {
        setAddr("—");
        setBal("");
      } else {
        const w = await getOrCreateWallet();
        setAddr(w.address);
        try {
          const b = await getGadBalance(w.address as `0x${string}`);
          setBal(b.pretty);
        } catch { setBal("—"); }
      }
    } catch (e: any) {
      Alert.alert("Wallet", e?.message ?? "Failed to load wallet");
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <View style={{ padding: 24, gap: 12 }}>
      <Text style={{ fontWeight: "700", fontSize: 18 }}>Wallet</Text>
      <Text>Age policy: {tier}</Text>

      {tier === "child" ? (
        <>
          <Text style={{ color:"#374151" }}>
            Children under 14 don’t create wallets. Personal earnings are protected in Family Vault.
          </Text>
          <Text>Locked balance: {locked.toLocaleString("en-US")} GAD Points</Text>
          <Button
            title="Ask parent to transfer / create wallet at 14+"
            onPress={() => navigation.navigate("FamilyTreasury")}
          />
        </>
      ) : (
        <>
          <Text>My address: {addr}</Text>
          <Text>GAD token balance: {bal || "—"}</Text>
          <Button title="Refresh" onPress={load} />
          <Button title="Set up / Backup wallet" onPress={() => navigation.navigate("WalletOnboarding")} />
          <Button title="My NFTs" onPress={() => navigation.navigate("NFTs")} />
          {locked > 0 && !!fid && (
            <Text style={{ color:"#6B7280" }}>
              You also have {locked.toLocaleString("en-US")} locked points (from child period) in Family Vault.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

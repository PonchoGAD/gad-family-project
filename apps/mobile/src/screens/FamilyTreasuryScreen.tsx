import { useEffect, useState } from "react";
import { View, Text, TextInput, Button, Alert, FlatList, TouchableOpacity } from "react-native";
import { auth, db } from "../lib/firebase";
import { ensureUserDoc } from "../lib/user";
import { createFamily, joinFamilyByCode, getFamily, subscribeMembers, shareInviteLink } from "../lib/families";
import { doc, getDoc } from "firebase/firestore";
import { ScrollView } from "react-native";
import LockTimer from "../components/LockTimer";
import ProofOfLock from "../components/ProofOfLock";

export default function TreasuryScreen(){
  return (
    <ScrollView style={{ flex:1, padding:16, backgroundColor:"#0b0c0f" }}>
      <View style={{ gap:16 }}>
        <LockTimer/>
        <ProofOfLock/>
      </View>
    </ScrollView>
  );
}

export default function FamiliesScreen({ navigation }: any) {
  const [myFamilyId, setMyFamilyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [members, setMembers] = useState<Array<{id:string}>>([]);

  useEffect(() => {
    (async () => {
      if (!auth.currentUser) return;
      await ensureUserDoc();
      const u = await getDoc(doc(db, "users", auth.currentUser.uid));
      const fid = u.data()?.familyId ?? null;
      setMyFamilyId(fid);

      if (fid) {
        const fam = await getFamily(fid);
        setInviteCode(fam?.inviteCode ?? null);
        const unsub = subscribeMembers(fid, (m) => setMembers(m));
        return () => unsub();
      }
    })();
  }, []);

  const onCreate = async () => {
    try {
      const { fid, inviteCode } = await createFamily(name.trim());
      setMyFamilyId(fid);
      setInviteCode(inviteCode);
      Alert.alert("Family created", `Invite code: ${inviteCode}`);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const onJoin = async () => {
    try {
      const fid = await joinFamilyByCode(code.trim());
      setMyFamilyId(fid);
      const fam = await getFamily(fid);
      setInviteCode(fam?.inviteCode ?? null);
      Alert.alert("Joined", `Family ID: ${fid}`);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const onShare = async () => {
    if (!inviteCode) return;
    const link = await shareInviteLink(inviteCode);
    Alert.alert("Invite", `Share code: ${inviteCode}\n${link}`);
  };

  return (
    <View style={{ padding: 24, gap: 12, flex: 1 }}>
      <Text style={{ fontWeight: "700", fontSize: 18 }}>Families</Text>
      <Text>My family ID: {myFamilyId ?? "-"}</Text>
      <Text>Invite code: {inviteCode ?? "-"}</Text>
      <TouchableOpacity onPress={onShare} disabled={!inviteCode}><Text style={{ color: "#2563eb" }}>Share invite</Text></TouchableOpacity>

      <Button
        title="Open Family Treasury"
        onPress={() => navigation.navigate("FamilyTreasury")}
        disabled={!myFamilyId}
      />
      <Button
        title="Children & Locked balances"
        onPress={() => (navigation as any).navigate("FamilyChildren")}
        disabled={!myFamilyId}
      />

      <View style={{ height: 1, backgroundColor: "#ddd", marginVertical: 8 }} />

      <Text>Create new family:</Text>
      <TextInput placeholder="Family name" value={name} onChangeText={setName} style={{ borderWidth: 1, padding: 8 }} />
      <Button title="Create" onPress={onCreate} disabled={!name.trim()} />

      <View style={{ height: 1, backgroundColor: "#ddd", marginVertical: 8 }} />

      <Text>Join by invite code:</Text>
      <TextInput placeholder="CODE" autoCapitalize="characters" value={code} onChangeText={setCode} style={{ borderWidth: 1, padding: 8 }} />
      <Button title="Join" onPress={onJoin} disabled={!code.trim()} />

      <View style={{ height: 1, backgroundColor: "#ddd", marginVertical: 8 }} />

      <Text style={{ fontWeight: "600" }}>Members</Text>
      <FlatList
        data={members}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <Text>- {item.id}</Text>}
        ListEmptyComponent={<Text style={{ color: "#666" }}>No members yet</Text>}
      />
    </View>
  );
}

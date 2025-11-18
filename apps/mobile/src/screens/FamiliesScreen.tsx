// apps/mobile/src/screens/FamiliesScreen.tsx

import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  FlatList,
  TouchableOpacity,
  Share,
} from "react-native";
import { auth, db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { fn } from "../lib/functionsClient";

type Member = {
  id: string;
  role?: string;
  birthDate?: string;
  ageYears?: number;
  isAdult?: boolean;
  noWallet?: boolean;
  approvedByOwner?: string | null;
};

export default function FamiliesScreen({ navigation }: any) {
  const [uid, setUid] = useState<string | null>(null);
  const [myFamilyId, setMyFamilyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [familyOwnerUid, setFamilyOwnerUid] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // -----------------------------------------------------
  // INIT
  // -----------------------------------------------------
  useEffect(() => {
    let unsubMembers: (() => void) | null = null;

    (async () => {
      try {
        // ensure user
        let user = auth.currentUser;
        if (!user) {
          const res = await signInAnonymously(auth);
          user = res.user;
        }
        setUid(user.uid);

        // ensure user doc
        const uRef = doc(db, "users", user.uid);
        const uSnap = await getDoc(uRef);
        if (!uSnap.exists()) {
          await setDoc(
            uRef,
            {
              createdAt: Date.now(),
              familyId: null,
            },
            { merge: true }
          );
        }

        const data = (uSnap.exists() ? uSnap.data() : {}) as any;
        const fid: string | null = data.familyId ?? null;
        setMyFamilyId(fid);

        // family
        if (fid) {
          const famRef = doc(db, "families", fid);
          const famSnap = await getDoc(famRef);
          if (famSnap.exists()) {
            const famData = famSnap.data() as any;
            setInviteCode(famData?.inviteCode ?? null);
            setFamilyOwnerUid(famData?.ownerUid ?? null);
          }

          const mCol = collection(db, "families", fid, "members");
          unsubMembers = onSnapshot(mCol, (snap) => {
            const arr: Member[] = [];
            snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
            setMembers(arr);
          });
        } else {
          setInviteCode(null);
          setFamilyOwnerUid(null);
          setMembers([]);
        }
      } catch (e: any) {
        console.log("Families init error", e);
        Alert.alert("Families", e?.message ?? "Failed to load families");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (unsubMembers) unsubMembers();
    };
  }, []);

  // -----------------------------------------------------
  // CREATE FAMILY
  // -----------------------------------------------------
  async function handleCreateFamily() {
    try {
      if (!uid) {
        Alert.alert("Error", "No user");
        return;
      }

      const trimmed = name.trim();
      if (!trimmed) return;

      const famRef = doc(collection(db, "families"));
      const fid = famRef.id;
      const invite = Math.random().toString(36).slice(2, 8).toUpperCase();

      await setDoc(
        famRef,
        {
          name: trimmed,
          inviteCode: invite,
          ownerUid: uid,
          createdAt: Date.now(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "families", fid, "members", uid),
        {
          role: "parent",
          joinedAt: Date.now(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "users", uid),
        { familyId: fid },
        { merge: true }
      );

      setMyFamilyId(fid);
      setInviteCode(invite);
      setFamilyOwnerUid(uid);

      Alert.alert("Family created", `Invite code: ${invite}`);
    } catch (e: any) {
      console.log("createFamily error", e);
      Alert.alert("Error", e?.message ?? "Failed to create family");
    }
  }

  // -----------------------------------------------------
  // JOIN FAMILY
  // -----------------------------------------------------
  async function handleJoinFamily() {
    try {
      if (!uid) {
        Alert.alert("Error", "No user");
        return;
      }

      const trimmed = code.trim().toUpperCase();
      if (!trimmed) return;

      const q = query(
        collection(db, "families"),
        where("inviteCode", "==", trimmed)
      );
      const qs = await getDocs(q);
      if (qs.empty) {
        Alert.alert("Error", "Family not found");
        return;
      }

      const famDoc = qs.docs[0];
      const fid = famDoc.id;
      const famData = famDoc.data() as any;

      await setDoc(
        doc(db, "families", fid, "members", uid),
        {
          role: "parent",
          joinedAt: Date.now(),
        },
        { merge: true }
      );
      await setDoc(
        doc(db, "users", uid),
        { familyId: fid },
        { merge: true }
      );

      setMyFamilyId(fid);
      setInviteCode(famData?.inviteCode ?? trimmed);
      setFamilyOwnerUid(famData?.ownerUid ?? null);

      Alert.alert("Joined", `Family ID: ${fid}`);
    } catch (e: any) {
      console.log("joinFamily error", e);
      Alert.alert("Error", e?.message ?? "Failed to join family");
    }
  }

  // -----------------------------------------------------
  // SHARE INVITE
  // -----------------------------------------------------
  async function handleShareInvite() {
    if (!inviteCode) return;
    try {
      const message = `Join my GAD Family.\nInvite code: ${inviteCode}`;
      await Share.share({ message });
    } catch (e) {
      console.log("share invite error", e);
    }
  }

  // -----------------------------------------------------
  // BECOME OWNER
  // -----------------------------------------------------
  async function handleBecomeOwner() {
    try {
      if (!uid || !myFamilyId) {
        Alert.alert("Error", "No family");
        return;
      }

      await setDoc(
        doc(db, "families", myFamilyId),
        { ownerUid: uid },
        { merge: true }
      );
      setFamilyOwnerUid(uid);

      Alert.alert("Family owner updated", "You are now the Family Owner");
    } catch (e: any) {
      console.log("becomeOwner error", e);
      Alert.alert("Error", e?.message ?? "Failed to update owner");
    }
  }

  // -----------------------------------------------------
  // APPROVE AGE (CALLABLE)
  // -----------------------------------------------------
  async function handleApproveAge(memberId: string, hasBirthDate: boolean) {
    try {
      if (!uid || !myFamilyId) {
        Alert.alert("Error", "No family");
        return;
      }
      if (!hasBirthDate) {
        Alert.alert(
          "No birth date",
          "Member has no birth date set yet. Ask them to enter it first."
        );
        return;
      }

      const call = fn<
        { fid: string; memberUid: string },
        { ok: boolean; ageYears: number; isAdult: boolean; noWallet: boolean }
      >("familyApproveMemberAge");

      const res = await call({ fid: myFamilyId, memberUid: memberId });
      const data = res.data;

      if (data.ok) {
        Alert.alert(
          "Age confirmed",
          `Age: ${data.ageYears} years\nAdult: ${
            data.isAdult ? "yes" : "no"
          }\nWallet disabled for child: ${data.noWallet ? "yes" : "no"}`
        );
      } else {
        Alert.alert("Error", "Failed to approve age");
      }
    } catch (e: any) {
      console.log("approveAge error", e);
      Alert.alert("Error", e?.message ?? "Failed to approve age");
    }
  }

  const isOwner =
    uid != null && familyOwnerUid != null && uid === familyOwnerUid;

  // -----------------------------------------------------
  // RENDER
  // -----------------------------------------------------
  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#0b0f17" }}>
      <Text
        style={{
          fontWeight: "700",
          fontSize: 20,
          color: "#ffffff",
          marginBottom: 12,
        }}
      >
        Families
      </Text>

      {/* ===================== MAIN FAMILY CARD ===================== */}
      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "#9CA3AF", marginBottom: 4 }}>My family</Text>
        <Text style={{ color: "#F9FAFB" }}>
          Family ID: {myFamilyId ?? "—"}
        </Text>
        <Text style={{ color: "#F9FAFB", marginTop: 2 }}>
          Invite code: {inviteCode ?? "—"}
        </Text>
        <Text style={{ color: "#F9FAFB", marginTop: 2 }}>
          Family owner:{" "}
          {familyOwnerUid
            ? familyOwnerUid === uid
              ? "You"
              : `${familyOwnerUid.slice(0, 6)}…`
            : "Not set"}
        </Text>

        <TouchableOpacity
          onPress={handleShareInvite}
          disabled={!inviteCode}
          style={{ marginTop: 8 }}
        >
          <Text
            style={{
              color: inviteCode ? "#60A5FA" : "#4B5563",
              fontWeight: "600",
            }}
          >
            Share invite
          </Text>
        </TouchableOpacity>

        {!isOwner && myFamilyId && uid && (
          <View style={{ marginTop: 8 }}>
            <Button title="Make me Family Owner" onPress={handleBecomeOwner} />
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            marginTop: 12,
            gap: 8,
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <Button
            title="Open Family Treasury"
            onPress={() => navigation.navigate("FamilyTreasury")}
            disabled={!myFamilyId}
          />
          <Button
            title="Family Chats"
            onPress={() => navigation.navigate("FamilyChatList")}
            disabled={!myFamilyId}
          />
          <Button
            title="Children & locked"
            onPress={() => navigation.navigate("FamilyChildren")}
            disabled={!myFamilyId}
          />
          <Button
            title="Family Tasks"
            onPress={() => navigation.navigate("FamilyTasks")}
            disabled={!myFamilyId}
          />
        </View>
      </View>

      {/* ===================== CREATE FAMILY ===================== */}
      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "#E5E7EB", fontWeight: "600" }}>
          Create new family
        </Text>

        <TextInput
          placeholder="Family name"
          placeholderTextColor="#6B7280"
          value={name}
          onChangeText={setName}
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: "#374151",
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: "#F9FAFB",
          }}
        />

        <View style={{ marginTop: 8 }}>
          <Button
            title="Create"
            onPress={handleCreateFamily}
            disabled={!name.trim() || loading}
          />
        </View>
      </View>

      {/* ===================== JOIN FAMILY ===================== */}
      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "#E5E7EB", fontWeight: "600" }}>
          Join by invite code
        </Text>

        <TextInput
          placeholder="CODE"
          autoCapitalize="characters"
          placeholderTextColor="#6B7280"
          value={code}
          onChangeText={setCode}
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: "#374151",
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: "#F9FAFB",
          }}
        />

        <View style={{ marginTop: 8 }}>
          <Button
            title="Join"
            onPress={handleJoinFamily}
            disabled={!code.trim() || loading}
          />
        </View>
      </View>

      {/* ===================== MEMBERS LIST ===================== */}
      <View
        style={{
          flex: 1,
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
        }}
      >
        <Text style={{ color: "#E5E7EB", fontWeight: "600", marginBottom: 8 }}>
          Members
        </Text>

        {loading ? (
          <Text style={{ color: "#6B7280" }}>Loading…</Text>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => {
              const birth = item.birthDate || "—";
              const age =
                typeof item.ageYears === "number" ? `${item.ageYears}` : "—";
              const adult =
                item.isAdult === undefined
                  ? "—"
                  : item.isAdult
                  ? "Adult"
                  : "Child";
              const walletState =
                item.noWallet === true
                  ? "Custodial only"
                  : item.isAdult
                  ? "Full wallet"
                  : "Normal";

              const approved =
                item.approvedByOwner && familyOwnerUid
                  ? item.approvedByOwner === familyOwnerUid
                    ? "✓ approved"
                    : "approved"
                  : "not approved";

              const canApprove =
                isOwner &&
                !!myFamilyId &&
                !!item.birthDate &&
                !item.approvedByOwner;

              return (
                <View style={{ marginVertical: 4 }}>
                  <Text style={{ color: "#D1D5DB" }}>
                    • {item.id.slice(0, 6)}… {item.role ? `(${item.role})` : ""}
                  </Text>

                  <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
                    DOB: {birth} • Age: {age} • {adult}
                  </Text>

                  <Text style={{ color: "#6B7280", fontSize: 12 }}>
                    Wallet: {walletState} • Status: {approved}
                  </Text>

                  {canApprove && (
                    <View style={{ marginTop: 4, maxWidth: 200 }}>
                      <Button
                        title="Approve age"
                        onPress={() =>
                          handleApproveAge(item.id, !!item.birthDate)
                        }
                      />
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={{ color: "#6B7280" }}>No members yet</Text>
            }
          />
        )}
      </View>
    </View>
  );
}

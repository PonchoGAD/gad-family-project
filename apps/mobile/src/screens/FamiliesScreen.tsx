// apps/mobile/src/screens/FamiliesScreen.tsx

import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  FlatList,
  TouchableOpacity,
  Share,
  ScrollView,
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
import { useTheme } from "../wallet/ui/theme";
import { useActiveUid, useIsDemo } from "../demo/DemoContext";

type Member = {
  id: string;
  role?: string;
  birthDate?: string;
  ageYears?: number;
  isAdult?: boolean;
  noWallet?: boolean;
  approvedByOwner?: string | null;
  lastSeen?: number; // timestamp (ms)
};

type Props = {
  navigation: any;
};

export default function FamiliesScreen({ navigation }: Props) {
  const G = useTheme();
  const { uid: ctxUid } = useActiveUid();
  const isDemo = useIsDemo();

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
        // определяем uid с учётом демо
        let currentUid = ctxUid;

        if (!currentUid) {
          // fallback: анонимка, если пользователь ещё не авторизован и не в демо
          const res = await signInAnonymously(auth);
          currentUid = res.user.uid;
        }

        if (!currentUid) {
          setLoading(false);
          return;
        }

        setUid(currentUid);

        // ensure user doc (только вне демо, чтобы не ломать подготовленные демо-доки)
        const uRef = doc(db, "users", currentUid);
        const uSnap = await getDoc(uRef);
        if (!uSnap.exists() && !isDemo) {
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
          try {
            const famRef = doc(db, "families", fid);
            const famSnap = await getDoc(famRef);
            if (famSnap.exists()) {
              const famData = famSnap.data() as any;
              setInviteCode(famData?.inviteCode ?? null);
              setFamilyOwnerUid(famData?.ownerUid ?? null);
            }
          } catch (e) {
            console.log("Families load family error", e);
          }

          const mCol = collection(db, "families", fid, "members");
          unsubMembers = onSnapshot(
            mCol,
            (snap) => {
              const arr: Member[] = [];
              snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
              setMembers(arr);
            },
            (err) => {
              console.log("Families members onSnapshot error", err);
            }
          );
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
  }, [ctxUid, isDemo]);

  // -----------------------------------------------------
  // COMMON BUTTON RENDERER (для единого стиля вместо системного Button)
  // -----------------------------------------------------
  function renderPrimaryButton(
    title: string,
    onPress: () => void,
    opts?: { disabled?: boolean; compact?: boolean }
  ) {
    const disabled = opts?.disabled;
    const compact = opts?.compact;

    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
        style={{
          paddingVertical: compact ? 8 : 10,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: disabled ? G.colors.buttonDisabled : G.colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: disabled ? G.colors.textMuted : "#0b0f17",
            fontWeight: "600",
            fontSize: 14,
          }}
        >
          {title}
        </Text>
      </TouchableOpacity>
    );
  }

  const isOwner =
    uid != null && familyOwnerUid != null && uid === familyOwnerUid;

  function renderOnlineStatus(m: Member) {
    if (!m.lastSeen) return "—";

    const now = Date.now();
    const diff = now - m.lastSeen;
    const online = diff < 2 * 60 * 1000; // < 2 минут

    if (online) return "online";

    const d = new Date(m.lastSeen);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `last seen ${hh}:${mm}`;
  }

  // -----------------------------------------------------
  // CREATE FAMILY
  // -----------------------------------------------------
  async function handleCreateFamily() {
    try {
      if (!uid) {
        Alert.alert("Error", "No user");
        return;
      }

      if (isDemo) {
        Alert.alert(
          "Demo",
          "In demo mode family creation is disabled. Use the prepared demo family."
        );
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

      if (isDemo) {
        Alert.alert(
          "Demo",
          "Joining families is disabled in demo mode. Demo user is already in a sample family."
        );
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

      if (isDemo) {
        Alert.alert(
          "Demo",
          "In demo mode ownership changes are disabled."
        );
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

      if (isDemo) {
        Alert.alert(
          "Demo",
          "Age approvals are disabled in demo mode. This flow is handled only in real families."
        );
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

  // -----------------------------------------------------
  // RENDER
  // -----------------------------------------------------
  return (
    <View style={{ flex: 1, backgroundColor: G.colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontWeight: "700",
            fontSize: 20,
            color: G.colors.text,
            marginBottom: 12,
          }}
        >
          Families
        </Text>

        {isDemo && (
          <View
            style={{
              borderRadius: 10,
              padding: 10,
              backgroundColor: G.colors.cardSoft,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: G.colors.demoBorder,
            }}
          >
            <Text
              style={{
                color: G.colors.demoAccent,
                fontWeight: "600",
                marginBottom: 4,
              }}
            >
              Demo mode
            </Text>
            <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
              This screen shows a sample family. Creating or joining families is
              disabled in demo — use the existing demo family setup.
            </Text>
          </View>
        )}

        {/* ===================== MAIN FAMILY CARD ===================== */}
        <View
          style={{
            borderRadius: 12,
            padding: 12,
            backgroundColor: G.colors.card,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text style={{ color: G.colors.textMuted, marginBottom: 4 }}>
            My family
          </Text>
          <Text style={{ color: G.colors.text }}>
            Family ID: {myFamilyId ?? "—"}
          </Text>
          <Text style={{ color: G.colors.text, marginTop: 2 }}>
            Invite code: {inviteCode ?? "—"}
          </Text>
          <Text style={{ color: G.colors.text, marginTop: 2 }}>
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
                color: inviteCode ? G.colors.accent : G.colors.textMuted,
                fontWeight: "600",
              }}
            >
              Share invite
            </Text>
          </TouchableOpacity>

          {!isOwner && myFamilyId && uid && !isDemo && (
            <View style={{ marginTop: 8, maxWidth: 220 }}>
              {renderPrimaryButton("Make me Family Owner", handleBecomeOwner)}
            </View>
          )}

          <View
            style={{
              flexDirection: "row",
              marginTop: 12,
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <View style={{ flex: 1, minWidth: "48%" }}>
              {renderPrimaryButton(
                "Family Map",
                () => navigation.navigate("FamilyMap"),
                { disabled: !myFamilyId }
              )}
            </View>

            <View style={{ flex: 1, minWidth: "48%" }}>
              {renderPrimaryButton(
                "Open Family Treasury",
                () => navigation.navigate("FamilyTreasury"),
                { disabled: !myFamilyId }
              )}
            </View>
            <View style={{ flex: 1, minWidth: "48%" }}>
              {renderPrimaryButton(
                "Family Chats",
                () => navigation.navigate("FamilyChatList"),
                { disabled: !myFamilyId }
              )}
            </View>
            <View style={{ flex: 1, minWidth: "48%" }}>
              {renderPrimaryButton(
                "Children & locked",
                () => navigation.navigate("FamilyChildren"),
                { disabled: !myFamilyId }
              )}
            </View>
            <View style={{ flex: 1, minWidth: "48%" }}>
              {renderPrimaryButton(
                "Family Tasks",
                () => navigation.navigate("FamilyTasks"),
                { disabled: !myFamilyId }
              )}
            </View>
          </View>
        </View>

        {/* ===================== CREATE FAMILY ===================== */}
        <View
          style={{
            borderRadius: 12,
            padding: 12,
            backgroundColor: G.colors.card,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text style={{ color: G.colors.text, fontWeight: "600" }}>
            Create new family
          </Text>

          <TextInput
            placeholder="Family name"
            placeholderTextColor={G.colors.textMuted}
            value={name}
            onChangeText={setName}
            editable={!isDemo}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: G.colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: G.colors.text,
              backgroundColor: G.colors.inputBg,
            }}
          />

          <View style={{ marginTop: 8, maxWidth: 160 }}>
            {renderPrimaryButton("Create", handleCreateFamily, {
              disabled: !name.trim() || loading || isDemo,
            })}
          </View>
        </View>

        {/* ===================== JOIN FAMILY ===================== */}
        <View
          style={{
            borderRadius: 12,
            padding: 12,
            backgroundColor: G.colors.card,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text style={{ color: G.colors.text, fontWeight: "600" }}>
            Join by invite code
          </Text>

          <TextInput
            placeholder="CODE"
            autoCapitalize="characters"
            placeholderTextColor={G.colors.textMuted}
            value={code}
            onChangeText={setCode}
            editable={!isDemo}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: G.colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: G.colors.text,
              backgroundColor: G.colors.inputBg,
            }}
          />

          <View style={{ marginTop: 8, maxWidth: 140 }}>
            {renderPrimaryButton("Join", handleJoinFamily, {
              disabled: !code.trim() || loading || isDemo,
            })}
          </View>
        </View>

        {/* ===================== MEMBERS LIST ===================== */}
        <View
          style={{
            borderRadius: 12,
            padding: 12,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "600",
              marginBottom: 8,
            }}
          >
            Members
          </Text>

          {loading ? (
            <Text style={{ color: G.colors.textMuted }}>Loading…</Text>
          ) : (
            <FlatList
              data={members}
              keyExtractor={(i) => i.id}
              scrollEnabled={false} // скроллит внешний ScrollView
              renderItem={({ item }) => {
                const birth = item.birthDate || "—";
                const age =
                  typeof item.ageYears === "number"
                    ? `${item.ageYears}`
                    : "—";
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
                  !item.approvedByOwner &&
                  !isDemo;

                const status = renderOnlineStatus(item);

                return (
                  <View style={{ marginVertical: 4 }}>
                    <Text style={{ color: G.colors.text }}>
                      • {item.id.slice(0, 6)}…{" "}
                      {item.role ? `(${item.role})` : ""}
                    </Text>

                    <Text
                      style={{ color: G.colors.textMuted, fontSize: 12 }}
                    >
                      DOB: {birth} • Age: {age} • {adult}
                    </Text>

                    <Text
                      style={{ color: G.colors.textMuted, fontSize: 12 }}
                    >
                      Wallet: {walletState} • Status: {approved}
                    </Text>

                    <Text
                      style={{
                        color:
                          status === "online"
                            ? G.colors.accent
                            : G.colors.textMuted,
                        fontSize: 12,
                      }}
                    >
                      {status}
                    </Text>

                    {canApprove && (
                      <View style={{ marginTop: 4, maxWidth: 200 }}>
                        {renderPrimaryButton("Approve age", () =>
                          handleApproveAge(item.id, !!item.birthDate)
                        )}
                      </View>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={{ color: G.colors.textMuted }}>
                  No members yet
                </Text>
              }
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

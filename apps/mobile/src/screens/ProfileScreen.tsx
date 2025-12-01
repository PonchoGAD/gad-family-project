// apps/mobile/src/screens/ProfileScreen.tsx
// -----------------------------------------------------
// User profile:
//
//  - avatar (initials)
//  - name, email, role (Parent/Kid)
//  - age & status (Adult / Child)
//  - family info (name, role, owner/member)
//  - quick links to core screens
//  - demo-mode indicator (from DemoContext)
// -----------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "../wallet/ui/theme";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useActiveUid, useIsDemo } from "../demo/DemoContext";

type Props = {
  navigation: any;
};

type FamilyRole = "parent" | "kid" | "owner" | "member" | string | null;

export default function ProfileScreen({ navigation }: Props) {
  const G = useTheme();
  const { uid } = useActiveUid();
  const isDemo = useIsDemo();

  const [loading, setLoading] = useState(true);

  // user
  const [userName, setUserName] = useState<string>("User");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userRole, setUserRole] = useState<FamilyRole>(null);
  const [isAdult, setIsAdult] = useState<boolean | null>(null);
  const [age, setAge] = useState<number | null>(null);

  // family
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [familyRole, setFamilyRole] = useState<FamilyRole>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        if (!uid) {
          setLoading(false);
          return;
        }

        // ----- USER -----
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        const u = (userSnap.exists() ? (userSnap.data() as any) : {}) as any;

        const displayName =
          u.displayName ||
          u.name ||
          auth.currentUser?.displayName ||
          "User";

        const email =
          u.email || auth.currentUser?.email || "no-email@example.com";

        const isAdultFlag =
          typeof u.isAdult === "boolean" ? (u.isAdult as boolean) : null;
        const ageValue =
          typeof u.age === "number" && Number.isFinite(u.age)
            ? (u.age as number)
            : null;

        const roleFromUser: FamilyRole =
          (u.role as FamilyRole) ||
          (u.isAdult === false ? "kid" : u.isAdult === true ? "parent" : null);

        setUserName(displayName);
        setUserEmail(email);
        setIsAdult(isAdultFlag);
        setAge(ageValue);
        setUserRole(roleFromUser);

        const fid =
          (u.familyId as string | undefined) && String(u.familyId).length
            ? (u.familyId as string)
            : null;

        setFamilyId(fid);

        if (fid) {
          // ----- FAMILY -----
          const famRef = doc(db, "families", fid);
          const famSnap = await getDoc(famRef);
          const fam = (famSnap.exists()
            ? (famSnap.data() as any)
            : {}) as any;

          setFamilyName(fam.name ?? "Family");
          const ownerUid = fam.ownerUid as string | undefined;
          setIsOwner(ownerUid === uid);

          // роль в members
          const memberRef = doc(db, "families", fid, "members", uid);
          const memberSnap = await getDoc(memberRef);
          if (memberSnap.exists()) {
            const m = memberSnap.data() as any;
            const r = (m.role as FamilyRole) ?? null;
            setFamilyRole(r);
          } else {
            setFamilyRole(null);
          }
        } else {
          setFamilyName(null);
          setFamilyRole(null);
          setIsOwner(false);
        }
      } catch (e) {
        console.log("ProfileScreen load error", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  function getInitials(): string {
    const source = userName && userName.trim().length ? userName : userEmail;
    if (!source) return "?";
    const parts = source.trim().split(" ");
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  function renderRoleTag(role: FamilyRole, isAdultFlag: boolean | null) {
    let label = "Member";
    let bg = "#1f2937";

    if (role === "parent") {
      label = "Parent";
      bg = "#0f766e";
    } else if (role === "kid") {
      label = "Kid";
      bg = "#7c2d12";
    } else if (role === "owner") {
      label = "Owner";
      bg = "#854d0e";
    }

    const ageLabel =
      isAdultFlag === null ? "Unverified" : isAdultFlag ? "Adult" : "Child";

    return (
      <View style={{ flexDirection: "row", marginTop: 6, gap: 6 }}>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: bg,
          }}
        >
          <Text
            style={{
              color: "#f9fafb",
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            {label}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: "#1f2937",
          }}
        >
          <Text
            style={{
              color: "#e5e7eb",
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            {ageLabel}
            {age ? ` • ${age} y/o` : ""}
          </Text>
        </View>
      </View>
    );
  }

  function go(route: string) {
    navigation.navigate(route);
  }

  return (
    <View style={{ flex: 1, backgroundColor: G.colors.bg }}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* DEMO BADGE */}
        {isDemo && (
          <View
            style={{
              padding: 10,
              borderRadius: 12,
              backgroundColor: G.colors.card,
              borderWidth: 1,
              borderColor: G.colors.border,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: G.colors.accent,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              Demo mode: ON — showing sample family data for investors.
            </Text>
          </View>
        )}

        {/* HEADER: AVATAR + NAME + EMAIL + ROLE */}
        <View style={styles.headerRow}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: G.colors.card,
                borderColor: G.colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: G.colors.accent,
                fontSize: 22,
                fontWeight: "800",
              }}
            >
              {getInitials()}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.title,
                { color: G.colors.text, marginBottom: 2 },
              ]}
            >
              {userName}
            </Text>
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 13,
              }}
            >
              {userEmail}
            </Text>

            {renderRoleTag(userRole, isAdult)}
          </View>
        </View>

        {/* FAMILY INFO */}
        <View
          style={[
            styles.card,
            { backgroundColor: G.colors.card, borderColor: G.colors.border },
          ]}
        >
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "600",
              fontSize: 16,
              marginBottom: 4,
            }}
          >
            Family
          </Text>

          {familyId ? (
            <>
              <Text
                style={{
                  color: G.colors.text,
                  fontSize: 14,
                  marginTop: 2,
                }}
              >
                {familyName ?? "Family"}
              </Text>
              <Text
                style={{
                  color: G.colors.textMuted,
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                Role:{" "}
                {familyRole
                  ? String(familyRole).charAt(0).toUpperCase() +
                    String(familyRole).slice(1)
                  : "Member"}
                {isOwner ? " • Owner" : " • Member"}
              </Text>
              <Text
                style={{
                  color: G.colors.textMuted,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                Family ID: {familyId}
              </Text>

              <View style={{ flexDirection: "row", marginTop: 10, gap: 8 }}>
                <PrimaryButton
                  label="Family settings"
                  onPress={() => go("FamilySettings")}
                  accent
                />
                <PrimaryButton
                  label="Family map"
                  onPress={() => go("FamilyMap")}
                />
              </View>
            </>
          ) : (
            <Text
              style={{ color: G.colors.textMuted, marginTop: 4, fontSize: 13 }}
            >
              You are not part of a family yet. Create or join a family in
              onboarding.
            </Text>
          )}
        </View>

        {/* AGE & SAFETY */}
        <View
          style={[
            styles.card,
            { backgroundColor: G.colors.card, borderColor: G.colors.border },
          ]}
        >
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "600",
              fontSize: 16,
            }}
          >
            Age & safety
          </Text>

          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Date of birth defines whether this profile is treated as Adult or
            Child in safety rules.
          </Text>

          <View
            style={{
              flexDirection: "row",
              marginTop: 10,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: G.colors.text,
                  fontSize: 14,
                }}
              >
                Status:{" "}
                {isAdult === null
                  ? "Not verified"
                  : isAdult
                  ? "Adult"
                  : "Child"}
                {age ? ` (${age} y/o)` : ""}
              </Text>
            </View>

            <PrimaryButton
              label="Edit DOB"
              onPress={() => go("ProfileDOB")}
            />
          </View>
        </View>

        {/* QUICK LINKS: STEPS / MISSIONS / REWARDS / WALLET */}
        <View
          style={[
            styles.card,
            { backgroundColor: G.colors.card, borderColor: G.colors.border },
          ]}
        >
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "600",
              fontSize: 16,
              marginBottom: 6,
            }}
          >
            GAD Family actions
          </Text>

          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            Daily flow: steps + missions → GAD Points → future claim to wallet.
          </Text>

          <View style={{ marginTop: 10, gap: 8 }}>
            <PrimaryButton
              label="Steps & Move-to-Earn"
              onPress={() => go("Steps")}
              accent
            />
            <PrimaryButton
              label="Missions / Goals"
              onPress={() => go("FamilyGoals")}
            />
            <PrimaryButton
              label="GAD Points & Rewards"
              onPress={() => go("Rewards")}
            />
            <PrimaryButton
              label="Wallet"
              onPress={() => go("Wallet")}
            />
          </View>
        </View>

        {/* SECURITY & SETTINGS */}
        <View
          style={[
            styles.card,
            { backgroundColor: G.colors.card, borderColor: G.colors.border },
          ]}
        >
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "600",
              fontSize: 16,
              marginBottom: 6,
            }}
          >
            Security & settings
          </Text>

          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            Manage notifications, safe zones, privacy and wallet tools.
          </Text>

          <View style={{ marginTop: 10, gap: 8 }}>
            <PrimaryButton
              label="Notifications & Security"
              onPress={() => go("Settings")}
            />
          </View>

          {isDemo && (
            <Text
              style={{
                color: G.colors.accent,
                fontSize: 12,
                marginTop: 8,
              }}
            >
              Demo mode is controlled from Settings → Investor demo.
            </Text>
          )}
        </View>

        {/* LOADING OVERLAY (минимальный) */}
        {loading && (
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 12,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Loading profile…
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  accent?: boolean;
};

function PrimaryButton({ label, onPress, accent }: BtnProps) {
  const G = useTheme();
  const bg = accent ? G.colors.accent : G.colors.card;
  const textColor = accent ? "#0b1120" : G.colors.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.btn,
        {
          backgroundColor: bg,
          borderWidth: accent ? 0 : 1,
          borderColor: accent ? "transparent" : G.colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.btnText,
          {
            color: textColor,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flexGrow: 1,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  btn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
  },
  btnText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

// ---------------------------------------------------------------
// apps/mobile/src/screens/FamilySettingsScreen.tsx
// Family settings:
//  - Change family name
//  - Manage safe zones (add/delete)
//  - Manage member roles (owner-only)
//  - Appearance: city / country / interests
//  - FindFriends toggle + share invite link
// ---------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import {
  Family,
  getCurrentUserFamilyId,
  subscribeFamily,
  updateFamilySettings,
  shareInviteLink,
} from "../lib/families";
import { auth, db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import type { FamilyPlace } from "../lib/geo";

type Member = {
  id: string;
  role?: string;
  birthDate?: string;
  ageYears?: number;
  isAdult?: boolean;
  lastSeen?: number;
};

export default function FamilySettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [family, setFamily] = useState<Family | null>(null);

  const [familyName, setFamilyName] = useState("");

  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [interestsText, setInterestsText] = useState("");
  const [findFriendsEnabled, setFindFriendsEnabled] = useState(false);

  const [safeZones, setSafeZones] = useState<FamilyPlace[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneLat, setNewZoneLat] = useState("");
  const [newZoneLng, setNewZoneLng] = useState("");
  const [newZoneRadius, setNewZoneRadius] = useState("150");

  const currentUid = auth.currentUser?.uid ?? null;

  const isOwner =
    !!currentUid && !!family?.ownerUid && family.ownerUid === currentUid;

  // ---------------- LOAD FAMILY + SUBSCRIBE ----------------
  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      try {
        const fid = await getCurrentUserFamilyId();
        if (!fid) {
          setLoading(false);
          setFamilyId(null);
          return;
        }

        setFamilyId(fid);

        unsub = subscribeFamily(fid, (fam) => {
          setFamily(fam);

          if (fam?.name) {
            setFamilyName(fam.name);
          } else {
            setFamilyName("");
          }

          if (fam?.location) {
            setCity(fam.location.city ?? "");
            setCountry(fam.location.country ?? "");
          } else {
            setCity("");
            setCountry("");
          }

          if (fam?.interests && Array.isArray(fam.interests)) {
            setInterestsText(fam.interests.join(", "));
          } else {
            setInterestsText("");
          }

          setFindFriendsEnabled(Boolean(fam?.findFriendsEnabled));
          setLoading(false);
        });

        // Дополнительно грузим safe zones + members
        await Promise.all([loadSafeZones(fid), loadMembers(fid)]);
      } catch (e: any) {
        console.error("FamilySettings load error", e);
        Alert.alert(
          "Family Settings",
          e?.message ?? "Failed to load family settings"
        );
        setLoading(false);
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // ---------------- LOAD SAFE ZONES ----------------
  async function loadSafeZones(fid: string) {
    try {
      const col = collection(db, "families", fid, "places");
      const snap = await getDocs(col);
      const arr: FamilyPlace[] = snap.docs.map((d) => {
        const v = d.data() as any;
        return {
          id: d.id,
          name: v.name ?? "Zone",
          lat: v.lat,
          lng: v.lng,
          radius: v.radius ?? 150,
        };
      });
      setSafeZones(arr);
    } catch (e) {
      console.log("loadSafeZones error", e);
    }
  }

  // ---------------- LOAD MEMBERS (for roles) ----------------
  async function loadMembers(fid: string) {
    try {
      const col = collection(db, "families", fid, "members");
      const snap = await getDocs(col);
      const arr: Member[] = snap.docs.map((d) => {
        const v = d.data() as any;
        return {
          id: d.id,
          role: v.role,
          birthDate: v.birthDate,
          ageYears: v.ageYears,
          isAdult: v.isAdult,
          lastSeen: typeof v.lastSeen === "number" ? v.lastSeen : undefined,
        };
      });
      setMembers(arr);
    } catch (e) {
      console.log("loadMembers error", e);
    }
  }

  // ---------------- HELPERS ----------------
  function parseInterests(text: string): string[] {
    return text
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function formatLastSeen(ts?: number): string {
    if (!ts) return "unknown";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "unknown";
    }
  }

  // ---------------- SAVE GENERAL SETTINGS ----------------
  async function handleSave() {
    try {
      if (!familyId) {
        Alert.alert("Family Settings", "You are not in a family yet.");
        return;
      }

      setSaving(true);

      const interests = parseInterests(interestsText);
      const trimmedName = familyName.trim();

      await updateFamilySettings(familyId, {
        name: trimmedName || undefined,
        location:
          city.trim() || country.trim()
            ? {
                lat: family?.location?.lat ?? 0,
                lng: family?.location?.lng ?? 0,
                city: city.trim() || undefined,
                country: country.trim() || undefined,
              }
            : family?.location ?? null,
        interests,
        findFriendsEnabled,
      });

      Alert.alert("Family Settings", "Settings saved");
    } catch (e: any) {
      console.error("FamilySettings save error", e);
      Alert.alert(
        "Family Settings",
        e?.message ?? "Failed to save settings"
      );
    } finally {
      setSaving(false);
    }
  }

  // ---------------- SHARE INVITE ----------------
  async function handleShareInvite() {
    try {
      if (!family || !family.inviteCode) {
        Alert.alert("Family Settings", "Invite code is not available yet.");
        return;
      }
      await shareInviteLink(family.inviteCode);
    } catch (e: any) {
      console.error("shareInviteLink error", e);
      Alert.alert("Family Settings", "Failed to share invite link");
    }
  }

  // ---------------- SAFE ZONES: ADD / DELETE ----------------
  async function handleAddZone() {
    try {
      if (!familyId) return;
      const name = newZoneName.trim() || "Safe zone";

      const latNum = Number(newZoneLat);
      const lngNum = Number(newZoneLng);
      const radiusNum = Number(newZoneRadius || "150");

      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
        Alert.alert("Safe zone", "Enter valid latitude and longitude.");
        return;
      }

      const radius = Number.isFinite(radiusNum) && radiusNum > 0 ? radiusNum : 150;

      const col = collection(db, "families", familyId, "places");
      const ref = doc(col); // auto ID

      await setDoc(ref, {
        name,
        lat: latNum,
        lng: lngNum,
        radius,
        createdAt: serverTimestamp(),
      });

      setNewZoneName("");
      setNewZoneLat("");
      setNewZoneLng("");
      setNewZoneRadius("150");

      await loadSafeZones(familyId);
    } catch (e: any) {
      console.log("handleAddZone error", e);
      Alert.alert("Safe zone", e?.message ?? "Failed to add safe zone");
    }
  }

  async function handleDeleteZone(id: string) {
    try {
      if (!familyId) return;
      await deleteDoc(doc(db, "families", familyId, "places", id));
      await loadSafeZones(familyId);
    } catch (e: any) {
      console.log("handleDeleteZone error", e);
      Alert.alert("Safe zone", e?.message ?? "Failed to delete safe zone");
    }
  }

  // ---------------- MEMBER ROLES (OWNER ONLY) ----------------
  async function handleSetRole(memberId: string, role: "parent" | "kid") {
    try {
      if (!familyId || !isOwner) return;
      await updateDoc(
        doc(db, "families", familyId, "members", memberId),
        {
          role,
          roleUpdatedAt: serverTimestamp(),
        }
      );
      await loadMembers(familyId);
    } catch (e: any) {
      console.log("handleSetRole error", e);
      Alert.alert("Members", e?.message ?? "Failed to update member role");
    }
  }

  // ---------------- RENDER ----------------
  if (loading) {
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

  if (!familyId) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#020617",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Text
          style={{
            color: "#e5e7eb",
            fontSize: 16,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          You are not part of any family yet.
        </Text>
        <Text
          style={{
            color: "#9ca3af",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          Create or join a family to manage its settings and discover other
          families nearby.
        </Text>
      </View>
    );
  }

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
          Family Settings
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 13 }}>
          Configure family name, safe zones, member roles and discovery.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Basic info + name + invite */}
        <View
          style={{
            marginBottom: 16,
            backgroundColor: "#0f172a",
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
          }}
        >
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
              marginBottom: 6,
            }}
          >
            Family
          </Text>

          {/* Name change */}
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>Name</Text>
          <TextInput
            placeholder="Family name"
            placeholderTextColor="#6b7280"
            value={familyName}
            onChangeText={setFamilyName}
            style={{
              backgroundColor: "#020617",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              color: "#f9fafb",
              marginTop: 4,
              borderWidth: 1,
              borderColor: "#1f2937",
            }}
          />

          {family?.inviteCode && (
            <Text
              style={{
                color: "#6b7280",
                fontSize: 12,
                marginTop: 8,
              }}
            >
              Invite code: {family.inviteCode}
            </Text>
          )}

          {family?.inviteCode && (
            <Pressable
              onPress={handleShareInvite}
              style={{
                marginTop: 12,
                borderRadius: 999,
                paddingVertical: 8,
                paddingHorizontal: 16,
                alignSelf: "flex-start",
                backgroundColor: "#3b82f6",
              }}
            >
              <Text
                style={{
                  color: "#f9fafb",
                  fontWeight: "600",
                  fontSize: 13,
                }}
              >
                Share invite link
              </Text>
            </Pressable>
          )}
        </View>

        {/* SAFE ZONES */}
        <View
          style={{
            marginBottom: 16,
            backgroundColor: "#020617",
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
          }}
        >
          <Text
            style={{
              color: "#f9fafb",
              fontWeight: "600",
              fontSize: 15,
              marginBottom: 4,
            }}
          >
            Safe zones
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 13, marginBottom: 10 }}>
            Home, school, work and other safe places used on the family map.
          </Text>

          {safeZones.length === 0 ? (
            <Text style={{ color: "#6b7280", fontSize: 13 }}>
              No safe zones yet.
            </Text>
          ) : (
            safeZones.map((z) => (
              <View
                key={z.id}
                style={{
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(31,41,55,0.8)",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text
                    style={{
                      color: "#e5e7eb",
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    {z.name}
                  </Text>
                  <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                    {z.lat.toFixed(5)}, {z.lng.toFixed(5)} • radius{" "}
                    {z.radius} m
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleDeleteZone(z.id)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "#f87171",
                  }}
                >
                  <Text
                    style={{
                      color: "#f87171",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Delete
                  </Text>
                </Pressable>
              </View>
            ))
          )}

          {/* Add new safe zone */}
          <View style={{ marginTop: 14 }}>
            <Text
              style={{
                color: "#f9fafb",
                fontWeight: "600",
                fontSize: 14,
                marginBottom: 6,
              }}
            >
              Add safe zone
            </Text>

            <Text style={{ color: "#9ca3af", fontSize: 12 }}>Name</Text>
            <TextInput
              placeholder="Home, School…"
              placeholderTextColor="#6b7280"
              value={newZoneName}
              onChangeText={setNewZoneName}
              style={{
                backgroundColor: "#0b1120",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: "#f9fafb",
                marginBottom: 6,
                borderWidth: 1,
                borderColor: "#1f2937",
              }}
            />

            <Text style={{ color: "#9ca3af", fontSize: 12 }}>Latitude</Text>
            <TextInput
              placeholder="e.g. 42.8746"
              placeholderTextColor="#6b7280"
              value={newZoneLat}
              onChangeText={setNewZoneLat}
              keyboardType="numeric"
              style={{
                backgroundColor: "#0b1120",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: "#f9fafb",
                marginBottom: 6,
                borderWidth: 1,
                borderColor: "#1f2937",
              }}
            />

            <Text style={{ color: "#9ca3af", fontSize: 12 }}>Longitude</Text>
            <TextInput
              placeholder="e.g. 74.6122"
              placeholderTextColor="#6b7280"
              value={newZoneLng}
              onChangeText={setNewZoneLng}
              keyboardType="numeric"
              style={{
                backgroundColor: "#0b1120",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: "#f9fafb",
                marginBottom: 6,
                borderWidth: 1,
                borderColor: "#1f2937",
              }}
            />

            <Text style={{ color: "#9ca3af", fontSize: 12 }}>Radius (m)</Text>
            <TextInput
              placeholder="150"
              placeholderTextColor="#6b7280"
              value={newZoneRadius}
              onChangeText={setNewZoneRadius}
              keyboardType="numeric"
              style={{
                backgroundColor: "#0b1120",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: "#f9fafb",
                marginBottom: 8,
                borderWidth: 1,
                borderColor: "#1f2937",
              }}
            />

            <Pressable
              onPress={handleAddZone}
              style={{
                marginTop: 4,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: "#22c55e",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#0b1120",
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                Add zone
              </Text>
            </Pressable>
          </View>
        </View>

        {/* MEMBER ROLES (OWNER ONLY) */}
        <View
          style={{
            marginBottom: 16,
            backgroundColor: "#020617",
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
          }}
        >
          <Text
            style={{
              color: "#f9fafb",
              fontWeight: "600",
              fontSize: 15,
              marginBottom: 4,
            }}
          >
            Member roles
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 13, marginBottom: 10 }}>
            Owner can mark members as parents or kids to apply wallet and
            protection rules.
          </Text>

          {!isOwner && (
            <Text style={{ color: "#facc15", fontSize: 12, marginBottom: 6 }}>
              Only the family owner can change roles.
            </Text>
          )}

          {members.length === 0 ? (
            <Text style={{ color: "#6b7280", fontSize: 13 }}>
              No members yet.
            </Text>
          ) : (
            members.map((m) => (
              <View
                key={m.id}
                style={{
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(31,41,55,0.8)",
                }}
              >
                <Text style={{ color: "#e5e7eb" }}>
                  {m.id.slice(0, 6)}…{" "}
                  {m.role ? `(${m.role})` : "(role not set)"}
                </Text>
                <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                  DOB: {m.birthDate ?? "—"} • Age:{" "}
                  {m.ageYears != null ? m.ageYears : "—"} •{" "}
                  {m.isAdult ? "Adult" : "Child"}
                </Text>
                <Text style={{ color: "#6b7280", fontSize: 12 }}>
                  Last seen: {formatLastSeen(m.lastSeen)}
                </Text>

                {isOwner && (
                  <View
                    style={{
                      flexDirection: "row",
                      marginTop: 6,
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() => handleSetRole(m.id, "parent")}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor:
                          m.role === "parent" ? "#22c55e" : "#4b5563",
                        backgroundColor:
                          m.role === "parent" ? "#15803d" : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            m.role === "parent" ? "#ecfdf5" : "#d1d5db",
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        Parent
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleSetRole(m.id, "kid")}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor:
                          m.role === "kid" ? "#f97316" : "#4b5563",
                        backgroundColor:
                          m.role === "kid" ? "#9a3412" : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          color: m.role === "kid" ? "#fef3c7" : "#d1d5db",
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        Kid
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* Find Friends toggle */}
        <View
          style={{
            marginBottom: 16,
            backgroundColor: "#0f172a",
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: "#f9fafb",
                fontWeight: "600",
                fontSize: 15,
                marginBottom: 4,
              }}
            >
              Show our family in “Find Friends”
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 13 }}>
              When enabled, nearby families will be able to discover you on the
              map and start chats.
            </Text>
          </View>
          <Switch
            value={findFriendsEnabled}
            onValueChange={setFindFriendsEnabled}
          />
        </View>

        {/* Location section */}
        <View
          style={{
            marginBottom: 16,
            backgroundColor: "#020617",
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
          }}
        >
          <Text
            style={{
              color: "#f9fafb",
              fontWeight: "600",
              fontSize: 15,
              marginBottom: 8,
            }}
          >
            Location (for discovery)
          </Text>
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
              marginBottom: 10,
            }}
          >
            City and country help nearby families understand where you are
            located. Exact coordinates stay private.
          </Text>

          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            City
          </Text>
          <TextInput
            placeholder="e.g. Bishkek"
            placeholderTextColor="#6b7280"
            value={city}
            onChangeText={setCity}
            style={{
              backgroundColor: "#0b1120",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              color: "#f9fafb",
              marginBottom: 10,
              borderWidth: 1,
              borderColor: "#1f2937",
            }}
          />

          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            Country
          </Text>
          <TextInput
            placeholder="e.g. Kyrgyzstan"
            placeholderTextColor="#6b7280"
            value={country}
            onChangeText={setCountry}
            style={{
              backgroundColor: "#0b1120",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              color: "#f9fafb",
              marginBottom: 4,
              borderWidth: 1,
              borderColor: "#1f2937",
            }}
          />
        </View>

        {/* Interests section */}
        <View
          style={{
            marginBottom: 16,
            backgroundColor: "#020617",
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
          }}
        >
          <Text
            style={{
              color: "#f9fafb",
              fontWeight: "600",
              fontSize: 15,
              marginBottom: 8,
            }}
          >
            Family interests
          </Text>
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
              marginBottom: 10,
            }}
          >
            Example: travel, hiking, board games, coding, crypto. Separate
            interests with commas.
          </Text>

          <TextInput
            placeholder="travel, hiking, games…"
            placeholderTextColor="#6b7280"
            value={interestsText}
            onChangeText={setInterestsText}
            style={{
              backgroundColor: "#0b1120",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              color: "#f9fafb",
              minHeight: 44,
              borderWidth: 1,
              borderColor: "#1f2937",
            }}
            multiline
          />
        </View>

        {/* Save button */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            marginTop: 8,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: "#22c55e",
            alignItems: "center",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#0b1120" />
          ) : (
            <Text
              style={{
                color: "#0b1120",
                fontWeight: "700",
                fontSize: 15,
              }}
            >
              Save settings
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

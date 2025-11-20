// apps/mobile/src/screens/FamilySettingsScreen.tsx

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

export default function FamilySettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [family, setFamily] = useState<Family | null>(null);

  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [interestsText, setInterestsText] = useState("");
  const [findFriendsEnabled, setFindFriendsEnabled] = useState(false);

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

          if (fam?.location) {
            setCity(fam.location.city ?? "");
            setCountry(fam.location.country ?? "");
          }

          if (fam?.interests && Array.isArray(fam.interests)) {
            setInterestsText(fam.interests.join(", "));
          } else {
            setInterestsText("");
          }

          setFindFriendsEnabled(Boolean(fam?.findFriendsEnabled));
          setLoading(false);
        });
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

  function parseInterests(text: string): string[] {
    return text
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async function handleSave() {
    try {
      if (!familyId) {
        Alert.alert("Family Settings", "You are not in a family yet.");
        return;
      }

      setSaving(true);

      const interests = parseInterests(interestsText);

      await updateFamilySettings(familyId, {
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

  async function handleShareInvite() {
    try {
      if (!family || !family.inviteCode) {
        Alert.alert(
          "Family Settings",
          "Invite code is not available yet."
        );
        return;
      }
      await shareInviteLink(family.inviteCode);
    } catch (e: any) {
      console.error("shareInviteLink error", e);
      Alert.alert("Family Settings", "Failed to share invite link");
    }
  }

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
          Control how your family appears in search and discover friends nearby.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Basic info */}
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
          <Text
            style={{
              color: "#f9fafb",
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            {family?.name ?? "Unnamed family"}
          </Text>
          {family?.inviteCode && (
            <Text
              style={{
                color: "#6b7280",
                fontSize: 12,
                marginTop: 4,
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

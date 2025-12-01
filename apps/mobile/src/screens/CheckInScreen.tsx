// apps/mobile/src/screens/CheckInScreen.tsx
// ------------------------------------------------------
// Check-In & SOS screen
//  - Быстрый чек-ин (дом, школа, работа, кастом)
//  - SOS-кнопка
//  - Привязан к Firestore-событиям:
//      • families/{fid}/checkIns/{id}  → createCheckIn
//      • families/{fid}/alerts/{id}    → emitSOSAlert (type: "sos")
// ------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";

import { useTheme } from "../wallet/ui/theme";
import { useIsDemo } from "../demo/DemoContext";

import { getCurrentUserFamilyId } from "../lib/families";
import { emitSOSAlert } from "../lib/alerts";
import { createCheckIn } from "../lib/checkins";

type Props = {
  navigation: any;
};

const PRESET_LABELS = ["Home", "School", "Work", "Other"];

export default function CheckInScreen({ navigation }: Props) {
  const G = useTheme();
  const isDemo = useIsDemo();

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loadingFamily, setLoadingFamily] = useState(true);

  const [selectedLabel, setSelectedLabel] = useState<string>("Home");
  const [customLabel, setCustomLabel] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [sendingSOS, setSendingSOS] = useState(false);

  // -------------------------------------------------------------
  // Load current family ID
  // -------------------------------------------------------------
  useEffect(() => {
    if (isDemo) {
      // В демо можно зашить фиктивный fid
      setFamilyId("demo-family");
      setLoadingFamily(false);
      return;
    }

    (async () => {
      try {
        setLoadingFamily(true);
        const fid = await getCurrentUserFamilyId();
        setFamilyId(fid ?? null);
      } catch (e) {
        console.log("[CheckInScreen] getCurrentUserFamilyId error", e);
        setFamilyId(null);
      } finally {
        setLoadingFamily(false);
      }
    })();
  }, [isDemo]);

  const effectiveLabel =
    selectedLabel === "Other" && customLabel.trim().length > 0
      ? customLabel.trim()
      : selectedLabel;

  const canSubmit =
    !!familyId && effectiveLabel.trim().length > 0 && !submitting;

  // -------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------
  async function handleCheckIn() {
    if (!familyId) {
      Alert.alert(
        "Family",
        isDemo
          ? "Demo mode: check-in will not be saved for a real family."
          : "No family found. Please join or create a family first."
      );
      return;
    }

    if (!effectiveLabel.trim()) {
      Alert.alert("Check-in", "Please choose or enter a place name.");
      return;
    }

    try {
      setSubmitting(true);

      // Сейчас без гео-координат, чистый чек-ин по названию
      await createCheckIn(familyId, {
        label: effectiveLabel,
        note: note.trim() || undefined,
      });

      Alert.alert("Check-in", "Check-in saved successfully.");
      setNote("");
      if (selectedLabel === "Other") {
        setCustomLabel("");
      }
    } catch (e: any) {
      console.log("[CheckInScreen] handleCheckIn error", e);
      Alert.alert(
        "Error",
        e?.message ?? "Unable to save check-in. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSOS() {
    if (!familyId) {
      Alert.alert(
        "SOS",
        isDemo
          ? "Demo mode: SOS alert is simulated only."
          : "No family found. SOS alert requires a family."
      );
      return;
    }

    try {
      setSendingSOS(true);
      await emitSOSAlert(familyId);
      Alert.alert(
        "SOS",
        "SOS alert has been sent to your family members."
      );
    } catch (e: any) {
      console.log("[CheckInScreen] handleSOS error", e);
      Alert.alert(
        "Error",
        e?.message ?? "Unable to send SOS alert. Please try again."
      );
    } finally {
      setSendingSOS(false);
    }
  }

  // -------------------------------------------------------------
  // UI
  // -------------------------------------------------------------
  const Container = Platform.OS === "ios" ? KeyboardAvoidingView : View;
  const containerProps =
    Platform.OS === "ios"
      ? { behavior: "padding" as const, style: { flex: 1 } }
      : { style: { flex: 1 } };

  return (
    <Container {...containerProps}>
      <View style={{ flex: 1, backgroundColor: G.colors.bg }}>
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Text
            style={{
              color: G.colors.text,
              fontSize: 20,
              fontWeight: "700",
            }}
          >
            Check-in & SOS
          </Text>

          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Quickly let your family know where you are and use SOS in case of
            emergency.
          </Text>

          {/* Family status */}
          <View
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              backgroundColor: G.colors.card,
              borderWidth: 1,
              borderColor: G.colors.borderSoft,
            }}
          >
            {loadingFamily ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <ActivityIndicator size="small" color={G.colors.accent} />
                <Text
                  style={{ color: G.colors.textMuted, fontSize: 12 }}
                >
                  Loading your family…
                </Text>
              </View>
            ) : familyId ? (
              <Text
                style={{ color: G.colors.textSoft, fontSize: 12 }}
              >
                Linked family:{" "}
                <Text style={{ color: G.colors.text }}>
                  {familyId}
                  {isDemo ? " (demo)" : ""}
                </Text>
              </Text>
            ) : (
              <Text
                style={{
                  color: "#f97373",
                  fontSize: 12,
                }}
              >
                No family linked. Check-in and SOS will not reach anyone until
                you join or create a family.
              </Text>
            )}
          </View>

          {/* Check-in card */}
          <View
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              backgroundColor: G.colors.cardStrong,
              borderWidth: 1,
              borderColor: G.colors.demoBorder,
            }}
          >
            <Text
              style={{
                color: G.colors.text,
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              Where are you now?
            </Text>

            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              Choose a place or enter a custom name.
            </Text>

            {/* Preset chips */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginTop: 10,
                gap: 8,
              }}
            >
              {PRESET_LABELS.map((label) => {
                const active = selectedLabel === label;
                return (
                  <TouchableOpacity
                    key={label}
                    onPress={() => setSelectedLabel(label)}
                    activeOpacity={0.9}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active
                        ? G.colors.demoAccent
                        : G.colors.borderSoft,
                      backgroundColor: active
                        ? G.colors.demoAccent + "22"
                        : G.colors.card,
                    }}
                  >
                    <Text
                      style={{
                        color: active
                          ? G.colors.demoAccent
                          : G.colors.textSoft,
                        fontSize: 12,
                        fontWeight: active ? "700" : "500",
                      }}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom label when "Other" */}
            {selectedLabel === "Other" && (
              <View style={{ marginTop: 10 }}>
                <Text
                  style={{
                    color: G.colors.textSoft,
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  Custom place name
                </Text>
                <TextInput
                  value={customLabel}
                  onChangeText={setCustomLabel}
                  placeholder="e.g. Gym, Friend’s house"
                  placeholderTextColor={G.colors.textMuted}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: G.colors.borderSoft,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: G.colors.text,
                    fontSize: 13,
                    backgroundColor: G.colors.card,
                  }}
                />
              </View>
            )}

            {/* Note */}
            <View style={{ marginTop: 10 }}>
              <Text
                style={{
                  color: G.colors.textSoft,
                  fontSize: 12,
                  marginBottom: 4,
                }}
              >
                Note (optional)
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Short note for your family"
                placeholderTextColor={G.colors.textMuted}
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: G.colors.borderSoft,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: G.colors.text,
                  fontSize: 13,
                  backgroundColor: G.colors.card,
                  minHeight: 40,
                }}
                multiline
              />
            </View>

            {/* Check-in button */}
            <TouchableOpacity
              onPress={handleCheckIn}
              activeOpacity={0.9}
              disabled={!canSubmit}
              style={{
                marginTop: 14,
                borderRadius: 999,
                paddingVertical: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: canSubmit
                  ? G.colors.demoAccent
                  : G.colors.borderMuted,
              }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text
                  style={{
                    color: "#000",
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  Check in now
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* SOS card */}
          <View
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              backgroundColor: "#1f2933",
              borderWidth: 1,
              borderColor: "#f97373",
            }}
          >
            <Text
              style={{
                color: "#fecaca",
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              Emergency SOS
            </Text>
            <Text
              style={{
                color: "#fee2e2",
                fontSize: 12,
                marginTop: 4,
              }}
            >
              Use SOS only if you feel unsafe or need urgent attention from
              your family.
            </Text>

            <TouchableOpacity
              onPress={handleSOS}
              activeOpacity={0.9}
              disabled={sendingSOS || !familyId}
              style={{
                marginTop: 12,
                borderRadius: 999,
                paddingVertical: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  sendingSOS || !familyId ? "#4b5563" : "#ef4444",
              }}
            >
              {sendingSOS ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: "800",
                  }}
                >
                  SEND SOS
                </Text>
              )}
            </TouchableOpacity>

            {isDemo && (
              <Text
                style={{
                  color: "#e5e7eb",
                  fontSize: 11,
                  marginTop: 6,
                }}
              >
                Demo mode: SOS alerts are not sent to real devices.
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    </Container>
  );
}

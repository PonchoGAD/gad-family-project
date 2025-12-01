// apps/mobile/src/screens/FamilyFundsScreen.tsx

import React from "react";
import {
  View,
  SafeAreaView,
  ScrollView,
  Text,
  Button,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "../wallet/ui/theme";
import { useIsDemo } from "../demo/DemoContext";

type DemoFund = {
  id: string;
  title: string;
  description: string;
  targetPoints: number;
  currentPoints: number;
};

export default function FamilyFundsScreen() {
  const G = useTheme();
  const isDemo = useIsDemo();

  const onStubPress = () => {
    Alert.alert(
      "Coming soon",
      [
        "Family Funds will allow you to create shared saving goals funded with GAD Points.",
        "",
        "Parents will set rules, cycles and unlock logic; kids will see progress and contribute through missions and steps.",
      ].join("\n")
    );
  };

  const demoFunds: DemoFund[] = isDemo
    ? [
        {
          id: "vacation",
          title: "Summer vacation fund",
          description: "Family trip to the seaside in July.",
          targetPoints: 100_000,
          currentPoints: 42_500,
        },
        {
          id: "education",
          title: "Kids’ education",
          description: "Extra classes and courses for the next school year.",
          targetPoints: 80_000,
          currentPoints: 27_000,
        },
        {
          id: "gadgets",
          title: "New family tablet",
          description: "Shared device for study and games.",
          targetPoints: 50_000,
          currentPoints: 19_300,
        },
      ]
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: G.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
      >
        <View>
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "700",
              fontSize: 20,
              marginBottom: 4,
            }}
          >
            Family Funds {isDemo ? "(demo preview)" : "(soon)"}
          </Text>

          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            Shared saving goals for your family: vacation, gadgets, education
            and more — funded by GAD Points.
          </Text>

          {isDemo && (
            <Text
              style={{
                color: G.colors.accent,
                fontSize: 11,
                marginTop: 6,
              }}
            >
              Demo mode: showing sample funds with simulated progress.
            </Text>
          )}
        </View>

        {/* DEMO FUNDS LIST */}
        {isDemo && (
          <View style={{ gap: 12 }}>
            {demoFunds.map((fund) => {
              const target = fund.targetPoints || 0;
              const current = fund.currentPoints || 0;
              const percent =
                target > 0
                  ? Math.min(100, Math.round((current / target) * 100))
                  : 0;

              return (
                <View
                  key={fund.id}
                  style={{
                    borderRadius: 16,
                    padding: 14,
                    backgroundColor: G.colors.card,
                    borderWidth: 1,
                    borderColor: G.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: G.colors.text,
                      fontSize: 16,
                      fontWeight: "700",
                      marginBottom: 4,
                    }}
                  >
                    {fund.title}
                  </Text>
                  <Text
                    style={{
                      color: G.colors.textMuted,
                      fontSize: 13,
                    }}
                  >
                    {fund.description}
                  </Text>

                  <Text
                    style={{
                      color: G.colors.textMuted,
                      fontSize: 12,
                      marginTop: 6,
                    }}
                  >
                    {current.toLocaleString("en-US")} /{" "}
                    {target.toLocaleString("en-US")} GAD Points ({percent}%)
                  </Text>

                  <View
                    style={{
                      height: 6,
                      backgroundColor: G.colors.bg,
                      borderRadius: 999,
                      marginTop: 6,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${percent}%`,
                        backgroundColor: G.colors.accent,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* CONCEPT CTA */}
        <View
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 16,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "600",
              fontSize: 15,
              marginBottom: 4,
            }}
          >
            How it will work
          </Text>
          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            Parents will create funds, define rules and connect them with
            missions. Kids will see progress and learn about saving, while
            rewards convert into on-chain GAD later.
          </Text>

          <View style={{ marginTop: 12 }}>
            <Button title="Preview concept" onPress={onStubPress} />
          </View>
        </View>

        {!isDemo && (
          <View
            style={{
              marginTop: 4,
            }}
          >
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 12,
              }}
            >
              In the full version, this screen will connect directly to your
              family vault and GAD Points balance.
            </Text>
          </View>
        )}

        {isDemo && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onStubPress}
            style={{
              marginTop: 4,
              paddingVertical: 10,
              borderRadius: 999,
              alignItems: "center",
              borderWidth: 1,
              borderColor: G.colors.border,
              backgroundColor: G.colors.card,
            }}
          >
            <Text
              style={{
                color: G.colors.accent,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              Show demo explainer
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

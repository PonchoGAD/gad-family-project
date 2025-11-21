// apps/mobile/src/screens/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
} from "react-native";
import { TREASURY, getTreasuryBalance } from "../lib/treasury";

const BG_IMAGE = require("../../assets/home-bg.png");

type Props = {
  navigation: any;
};

export default function HomeScreen({ navigation }: Props) {
  const [treasuryBalance, setTreasuryBalance] = useState<string>("—");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const bal = await getTreasuryBalance();
        setTreasuryBalance(`${bal.pretty} GAD`);
      } catch {
        setTreasuryBalance("On-chain data not available in this build");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function renderButton(label: string, onPress: () => void) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 999,
          backgroundColor: "#f9fafb", // светлая кнопка
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            color: "#020617",
            fontWeight: "600",
            fontSize: 15,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <ImageBackground
      source={BG_IMAGE}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      {/* Тёмный полупрозрачный слой, чтобы фон не мешал тексту */}
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(2, 6, 23, 0.82)",
        }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: 24,
            paddingBottom: 40,
          }}
        >
          {/* Заголовок */}
          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: "#f9fafb",
            }}
          >
            Welcome to GAD Family
          </Text>
          <Text style={{ color: "#cbd5f5", marginTop: 6, fontSize: 14 }}>
            Family-first Move-to-Earn app: steps → GAD points → long-term
            family treasury.
          </Text>

          {/* Карточка казны */}
          <View
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 16,
              backgroundColor: "rgba(15, 23, 42, 0.92)",
              borderWidth: 1,
              borderColor: "rgba(148, 163, 184, 0.4)",
            }}
          >
            <Text
              style={{
                color: "#e5e7eb",
                fontWeight: "600",
                fontSize: 16,
              }}
            >
              Global Treasury SAFE
            </Text>
            <Text
              style={{ color: "#9ca3af", marginTop: 4, fontSize: 11 }}
              numberOfLines={1}
            >
              {TREASURY}
            </Text>

            <Text style={{ color: "#9ca3af", marginTop: 10, fontSize: 13 }}>
              Estimated balance:
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              {loading ? (
                <ActivityIndicator />
              ) : (
                <Text
                  style={{
                    color: "#4ade80",
                    fontWeight: "700",
                    fontSize: 17,
                  }}
                >
                  {treasuryBalance}
                </Text>
              )}
            </View>

            <Text
              style={{
                color: "#6b7280",
                fontSize: 12,
                marginTop: 8,
              }}
            >
              On-chain data is read-only in this mobile build. Full controls are
              available on the web dashboard.
            </Text>
          </View>

          {/* Основные действия */}
          <View style={{ marginTop: 28 }}>
            <Text
              style={{
                color: "#e5e7eb",
                fontWeight: "600",
                fontSize: 16,
                marginBottom: 12,
              }}
            >
              Quick actions
            </Text>

            {renderButton("Open Wallet", () =>
              navigation.navigate("Wallet")
            )}
            {renderButton("Steps Tracker", () =>
              navigation.navigate("Steps")
            )}
            {renderButton("Family & Treasury", () =>
              navigation.navigate("Families")
            )}
          </View>
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

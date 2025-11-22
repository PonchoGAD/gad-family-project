// apps/mobile/src/screens/HomeScreen.tsx

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  Animated,
} from "react-native";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

const BG_IMAGE = require("../../assets/home-bg.png");

type Props = {
  navigation: any;
};

type HomeStats = {
  userName: string | null;
  familyName: string | null;
  todaySteps: number | null;
  lastRewardGad: string | null;
  lastRewardDate: string | null;
};

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function HomeScreen({ navigation }: Props) {
  const [stats, setStats] = useState<HomeStats>({
    userName: null,
    familyName: null,
    todaySteps: null,
    lastRewardGad: null,
    lastRewardDate: null,
  });

  const [loadingStats, setLoadingStats] = useState<boolean>(true);

  // Анимации: fade + лёгкий подъём
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(16)).current;

  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const buttonsTranslateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    // Старт анимаций
    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(headerTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(buttonsTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [headerOpacity, headerTranslateY, buttonsOpacity, buttonsTranslateY]);

  useEffect(() => {
    (async () => {
      try {
        let user = auth.currentUser;
        if (!user) {
          const res = await signInAnonymously(auth);
          user = res.user;
        }
        const uid = user.uid;

        // 1) users/{uid}
        const uSnap = await getDoc(doc(db, "users", uid));
        const uData = (uSnap.exists() ? uSnap.data() : {}) as any;

        const userName: string | null =
          (uData.displayName as string | undefined) ??
          (uData.name as string | undefined) ??
          null;

        const familyId: string | null =
          (uData.familyId as string | undefined) ?? null;

        // 2) families/{fid}
        let familyName: string | null = null;
        if (familyId) {
          const fSnap = await getDoc(doc(db, "families", familyId));
          if (fSnap.exists()) {
            const fData = fSnap.data() as any;
            familyName =
              (fData.name as string | undefined) ??
              `Family ${familyId.slice(0, 4)}`;
          }
        }

        // 3) dailySteps/{uid}/days/{today}
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const todayKey = `${yyyy}-${mm}-${dd}`;

        let todaySteps: number | null = null;
        const stepsSnap = await getDoc(
          doc(db, "dailySteps", uid, "days", todayKey)
        );
        if (stepsSnap.exists()) {
          const sData = stepsSnap.data() as any;
          todaySteps = Number(sData.steps ?? 0);
        }

        // 4) rewards/{uid} — агрегат
        let lastRewardGad: string | null = null;
        let lastRewardDate: string | null = null;

        const rSnap = await getDoc(doc(db, "rewards", uid));
        if (rSnap.exists()) {
          const rData = rSnap.data() as any;
          if (typeof rData.lastGadPreview === "string") {
            lastRewardGad = rData.lastGadPreview;
          } else if (typeof rData.lastGadPreview === "number") {
            lastRewardGad = rData.lastGadPreview.toString();
          }
          if (typeof rData.lastDate === "string") {
            lastRewardDate = rData.lastDate;
          }
        }

        setStats({
          userName,
          familyName,
          todaySteps,
          lastRewardGad,
          lastRewardDate,
        });
      } catch (e) {
        console.log("HomeScreen stats load error", e);
      } finally {
        setLoadingStats(false);
      }
    })();
  }, []);

  function renderButton(label: string, onPress: () => void, subLabel?: string) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={{
          paddingVertical: 14,
          paddingHorizontal: 18,
          borderRadius: 18,
          backgroundColor: "rgba(15, 23, 42, 0.95)", // глубокий тёмный
          marginBottom: 10,
          borderWidth: 1,
          borderColor: "rgba(250, 204, 21, 0.6)", // золото amber-400
        }}
        activeOpacity={0.85}
      >
        <Text
          style={{
            color: "#f9fafb",
            fontWeight: "600",
            fontSize: 15,
          }}
        >
          {label}
        </Text>
        {subLabel ? (
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {subLabel}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  const initials =
    stats.userName && stats.userName.trim().length > 0
      ? stats.userName
          .split(" ")
          .map((p: string) => p.trim()[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "GF";

  const todayLabel = formatDateLabel(new Date());

  return (
    <ImageBackground
      source={BG_IMAGE}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(2, 6, 23, 0.88)", // плотнее затемнение
        }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 24,
            paddingBottom: 40,
            justifyContent: "space-between",
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER CARD WITH USER + STATS */}
          <Animated.View
            style={{
              opacity: headerOpacity,
              transform: [{ translateY: headerTranslateY }],
            }}
          >
            {/* Верхняя строка: аватар + имя + семья */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              {/* Аватар */}
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  borderWidth: 1,
                  borderColor: "rgba(250, 204, 21, 0.8)", // золотой акцент
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Text
                  style={{
                    color: "#facc15",
                    fontWeight: "700",
                    fontSize: 18,
                  }}
                >
                  {initials}
                </Text>
              </View>

              {/* Имя + семья */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: "#f9fafb",
                  }}
                >
                  {stats.userName || "GAD Family Member"}
                </Text>
                <Text
                  style={{
                    color: "#cbd5f5",
                    marginTop: 2,
                    fontSize: 13,
                  }}
                >
                  {stats.familyName
                    ? `Family: ${stats.familyName}`
                    : "No family yet — create or join from Families tab."}
                </Text>
              </View>
            </View>

            {/* Карточка со статистикой: шаги + GAD */}
            <View
              style={{
                borderRadius: 16,
                padding: 14,
                backgroundColor: "rgba(15, 23, 42, 0.92)",
                borderWidth: 1,
                borderColor: "rgba(148, 163, 184, 0.4)",
              }}
            >
              <Text
                style={{
                  color: "#9ca3af",
                  fontSize: 12,
                  marginBottom: 4,
                }}
              >
                Today · {todayLabel}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                {/* Steps */}
                <View>
                  <Text
                    style={{
                      color: "#e5e7eb",
                      fontSize: 13,
                      marginBottom: 2,
                    }}
                  >
                    Steps
                  </Text>
                  <Text
                    style={{
                      color: "#f9fafb",
                      fontSize: 22,
                      fontWeight: "800",
                    }}
                  >
                    {stats.todaySteps != null ? stats.todaySteps : "—"}
                  </Text>
                </View>

                {/* GAD preview */}
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: "#e5e7eb",
                      fontSize: 13,
                      marginBottom: 2,
                    }}
                  >
                    GAD preview
                  </Text>
                  <Text
                    style={{
                      color: "#facc15",
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    {stats.lastRewardGad != null
                      ? `${stats.lastRewardGad} GAD`
                      : "—"}
                  </Text>
                  {stats.lastRewardDate && (
                    <Text
                      style={{
                        color: "#6b7280",
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      Last calc: {stats.lastRewardDate}
                    </Text>
                  )}
                </View>
              </View>

              {loadingStats && (
                <Text
                  style={{
                    color: "#6b7280",
                    fontSize: 11,
                    marginTop: 6,
                  }}
                >
                  Loading your stats…
                </Text>
              )}
            </View>

            {/* Описание приложения */}
            <View style={{ marginTop: 16 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: "#f9fafb",
                }}
              >
                Welcome to GAD Family
              </Text>
              <Text
                style={{
                  color: "#cbd5f5",
                  marginTop: 6,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                Family-first Move-to-Earn: your daily steps convert into GAD
                points and long-term family treasury — with safety, wallets,
                NFTs and AI assistant built in.
              </Text>
            </View>
          </Animated.View>

          {/* QUICK ACTIONS */}
          <Animated.View
            style={{
              marginTop: 32,
              opacity: buttonsOpacity,
              transform: [{ translateY: buttonsTranslateY }],
            }}
          >
            <Text
              style={{
                color: "#e5e7eb",
                fontWeight: "700",
                fontSize: 16,
                marginBottom: 16,
              }}
            >
              Quick actions
            </Text>

            {renderButton("Open Wallet", () => navigation.navigate("Wallet"))}
            {renderButton(
              "Steps Tracker",
              () => navigation.navigate("Steps"),
              "Track your daily steps and progress."
            )}
            {renderButton(
              "Family & Treasury",
              () => navigation.navigate("Family"),
              "Manage family members, vault and tasks."
            )}
            {renderButton(
              "Wallet History",
              () => navigation.navigate("WalletActivity"),
              "View on-chain activity of your GAD wallet."
            )}
            {renderButton(
              "My NFTs",
              () => navigation.navigate("NFTGallery"),
              "Browse your GAD ecosystem NFTs."
            )}
            {renderButton(
              "Family Goals",
              () => navigation.navigate("FamilyGoals"),
              "Set long-term milestones for your family."
            )}
            {renderButton(
              "AI Assistant",
              () => navigation.navigate("Assistant"),
              "Ask questions and get guidance inside the app."
            )}
            {renderButton(
              "Settings",
              () => navigation.navigate("More"),
              "Location, discovery, referrals, wallet tools."
            )}
          </Animated.View>
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

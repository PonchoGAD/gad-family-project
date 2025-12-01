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
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useTheme } from "../wallet/ui/theme";
import { useActiveUid, useIsDemo } from "../demo/DemoContext";

// V2 Step Engine client
import {
  getTodayStepsPreview,
  subscribeTodayReward,
} from "../lib/stepEngine";

const BG_IMAGE = require("../../assets/home-bg.png");

type Props = {
  navigation: any;
};

type HomeStats = {
  userName: string | null;
  familyName: string | null;
  todaySteps: number | null;
  todayRewardGad: string | null; // gadEarned / gadPreview за сегодня
  todayRewardStatus: string | null; // ok / limit / skipped / rejected / demo
  lastRewardGad: string | null; // fallback: последний GAD из агрегата
  lastRewardDate: string | null; // дата последнего расчёта
};

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function HomeScreen({ navigation }: Props) {
  const G = useTheme();
  const { uid } = useActiveUid();
  const isDemo = useIsDemo();

  const [stats, setStats] = useState<HomeStats>({
    userName: null,
    familyName: null,
    todaySteps: null,
    todayRewardGad: null,
    todayRewardStatus: null,
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
    let unsubReward: (() => void) | null = null;

    (async () => {
      try {
        if (!uid) {
          // Нет активного uid (ни реального, ни демо) — просто показываем пустую витрину
          setLoadingStats(false);
          return;
        }

        // 1) users/{uid}
        const uSnap = await getDoc(doc(db, "users", uid));
        const uData = (uSnap.exists() ? uSnap.data() : {}) as any;

        const userName: string | null =
          (uData.displayName as string | undefined) ??
          (uData.name as string | undefined) ??
          (isDemo ? "Demo Investor" : null);

        const familyId: string | null =
          (uData.familyId as string | undefined) ?? null;

        const role: string | null = (uData.role as string | undefined) ?? null;

        // если нет роли или семьи → уводим в онбординг ТОЛЬКО в реальном режиме
        if (!role || !familyId) {
          if (!isDemo) {
            navigation.reset({
              index: 0,
              routes: [{ name: "AuthWelcome" as never }],
            });
          }
          // В демо-режиме просто показываем пустую семью, без редиректа
        }

        // 2) families/{fid}
        let familyName: string | null = null;
        if (familyId) {
          try {
            const fSnap = await getDoc(doc(db, "families", familyId));
            if (fSnap.exists()) {
              const fData = fSnap.data() as any;
              familyName =
                (fData.name as string | undefined) ??
                `Family ${familyId.slice(0, 4)}`;
            }
          } catch (e) {
            // в демо / при permissions ошибке просто оставляем familyName null
            console.log("HomeScreen family load error", e);
          }
        }

        // Общий ключ для сегодняшней даты YYYY-MM-DD (нужен только для DEMO и fallback)
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const todayKey = `${yyyy}-${mm}-${dd}`;

        // 3) todaySteps / todayReward через V2-хелперы
        let todaySteps: number | null = null;
        let todayRewardGad: string | null = null;
        let todayRewardStatus: string | null = null;

        if (!isDemo) {
          try {
            const preview = await getTodayStepsPreview(uid);
            todaySteps = Number.isFinite(preview.steps)
              ? preview.steps
              : 0;

            const reward = preview.reward;
            if (reward) {
              // В типе StepEngineDayResult gadEarned/gadPreview — строки
              todayRewardGad =
                reward.gadEarned ?? reward.gadPreview ?? null;
              todayRewardStatus = reward.status ?? null;
            }

            // Live-обновления reward за today
            unsubReward = subscribeTodayReward(uid, (liveReward) => {
              setStats((prev) => {
                if (!liveReward) {
                  return {
                    ...prev,
                    todayRewardGad: prev.todayRewardGad,
                    todayRewardStatus: prev.todayRewardStatus,
                  };
                }
                const liveGad =
                  liveReward.gadEarned ??
                  liveReward.gadPreview ??
                  prev.todayRewardGad;
                const liveStatus = liveReward.status ?? prev.todayRewardStatus;

                return {
                  ...prev,
                  todayRewardGad: liveGad,
                  todayRewardStatus: liveStatus,
                };
              });
            });
          } catch (e) {
            console.log("HomeScreen today steps/reward load error", e);
          }
        }

        // 4) rewards/{uid} — агрегат (fallback для lastReward)
        let lastRewardGad: string | null = todayRewardGad;
        let lastRewardDate: string | null = todayRewardGad ? todayKey : null;

        try {
          const rSnap = await getDoc(doc(db, "rewards", uid));
          if (rSnap.exists()) {
            const rData = rSnap.data() as any;

            // старое поле совместимости lastGadPreview (если есть)
            let aggGad: string | null = null;
            if (typeof rData.lastGadPreview === "string") {
              aggGad = rData.lastGadPreview;
            } else if (typeof rData.lastGadPreview === "number") {
              aggGad = rData.lastGadPreview.toString();
            }

            const aggDate =
              typeof rData.lastDate === "string" ? rData.lastDate : null;

            // если за сегодня ещё ничего нет — используем агрегат
            if (!lastRewardGad && aggGad) {
              lastRewardGad = aggGad;
            }
            if (!lastRewardDate && aggDate) {
              lastRewardDate = aggDate;
            }
          }
        } catch (e) {
          console.log("HomeScreen rewards agg load error", e);
        }

        // 5) DEMO-режим: подставляем фейковые значения
        if (isDemo) {
          if (todaySteps == null) {
            todaySteps = 8200;
          }
          if (!todayRewardGad) {
            todayRewardGad = "65.5";
          }
          if (!lastRewardGad) {
            lastRewardGad = todayRewardGad;
          }
          if (!lastRewardDate) {
            lastRewardDate = todayKey;
          }
          if (!todayRewardStatus) {
            todayRewardStatus = "demo";
          }
        }

        setStats({
          userName,
          familyName,
          todaySteps,
          todayRewardGad,
          todayRewardStatus,
          lastRewardGad,
          lastRewardDate,
        });
      } catch (e) {
        console.log("HomeScreen stats load error", e);
      } finally {
        setLoadingStats(false);
      }
    })();

    return () => {
      if (unsubReward) {
        unsubReward();
      }
    };
  }, [navigation, uid, isDemo]);

  function renderButton(
    label: string,
    onPress: () => void,
    subLabel?: string
  ) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={{
          paddingVertical: 14,
          paddingHorizontal: 18,
          borderRadius: 18,
          backgroundColor: G.colors.card,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: G.colors.accentSoft,
        }}
        activeOpacity={0.85}
      >
        <Text
          style={{
            color: G.colors.text,
            fontWeight: "600",
            fontSize: 15,
          }}
        >
          {label}
        </Text>
        {subLabel ? (
          <Text
            style={{
              color: G.colors.textMuted,
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

  // Приоритет отображения GAD:
  // 1) todayRewardGad (сегодняшний результат движка)
  // 2) lastRewardGad (агрегат / последняя дата)
  const gadLabel =
    stats.todayRewardGad != null
      ? `${stats.todayRewardGad} GAD`
      : stats.lastRewardGad != null
      ? `${stats.lastRewardGad} GAD`
      : "—";

  return (
    <ImageBackground source={BG_IMAGE} style={{ flex: 1 }} resizeMode="cover">
      <View
        style={{
          flex: 1,
          backgroundColor: G.colors.bgOverlay, // overlay поверх фоновой картинки
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
                  backgroundColor: G.colors.card,
                  borderWidth: 1,
                  borderColor: G.colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Text
                  style={{
                    color: G.colors.accent,
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
                    color: G.colors.text,
                  }}
                >
                  {stats.userName || "GAD Family Member"}
                </Text>
                <Text
                  style={{
                    color: G.colors.textMuted,
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
                backgroundColor: G.colors.cardStrong,
                borderWidth: 1,
                borderColor: G.colors.border,
              }}
            >
              <Text
                style={{
                  color: G.colors.textMuted,
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
                      color: G.colors.textMuted,
                      fontSize: 13,
                      marginBottom: 2,
                    }}
                  >
                    Steps
                  </Text>
                  <Text
                    style={{
                      color: G.colors.text,
                      fontSize: 22,
                      fontWeight: "800",
                    }}
                  >
                    {stats.todaySteps != null ? stats.todaySteps : "—"}
                  </Text>
                </View>

                {/* GAD today (Step Engine V2) */}
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: G.colors.textMuted,
                      fontSize: 13,
                      marginBottom: 2,
                    }}
                  >
                    GAD today
                  </Text>
                  <Text
                    style={{
                      color: G.colors.accent,
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    {gadLabel}
                  </Text>
                  {stats.lastRewardDate && (
                    <Text
                      style={{
                        color: G.colors.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      Last calc: {stats.lastRewardDate}
                    </Text>
                  )}
                </View>
              </View>

              {/* статус дня (если есть) */}
              {stats.todayRewardStatus && (
                <Text
                  style={{
                    color: G.colors.textMuted,
                    fontSize: 11,
                    marginTop: 6,
                  }}
                >
                  Today status: {stats.todayRewardStatus}
                </Text>
              )}

              {loadingStats && (
                <Text
                  style={{
                    color: G.colors.textMuted,
                    fontSize: 11,
                    marginTop: 6,
                  }}
                >
                  Loading your stats…
                </Text>
              )}

              {isDemo && (
                <Text
                  style={{
                    color: G.colors.demoAccent,
                    fontSize: 11,
                    marginTop: 6,
                  }}
                >
                  Demo mode: showing sample family progress.
                </Text>
              )}
            </View>

            {/* Описание приложения */}
            <View style={{ marginTop: 16 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: G.colors.text,
                }}
              >
                Welcome to GAD Family
              </Text>
              <Text
                style={{
                  color: G.colors.textSoft,
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
                color: G.colors.text,
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
              () => navigation.navigate("Families"),
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
              () => navigation.navigate("Settings"),
              "Location, discovery, referrals, wallet tools."
            )}
          </Animated.View>
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

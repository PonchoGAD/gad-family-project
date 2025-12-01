// ---------------------------------------------------------------
// apps/mobile/src/screens/StepsScreen.tsx
// Final Move-to-Earn steps tracker + history + GAD preview (V2)
// - GAD UI (useTheme)
// - Полная поддержка DemoContext (демо-uid, демо-шаги, демо-история)
// - Чистое разделение: demo vs реальный Step Engine
// - Связка: шаги → GAD Points (preview) → будущий GAD
// - Просмотр одного дня по StepEngine V2 (currentDate)
// ---------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Pedometer } from "expo-sensors";
import { auth, db } from "../firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { fn } from "../lib/functionsClient";
import { useTheme } from "../wallet/ui/theme";
import { todayKey, formatSteps } from "../lib/steps";
import { useActiveUid, useIsDemo } from "../demo/DemoContext";

import type { StepEngineDayResult } from "../lib/stepEngineTypes";
import { fetchRewardForDate } from "../lib/stepEngine";

type HistoryItem = {
  id: string;
  steps: number;
  gad?: string | number | null;
  status?: string | null;
};

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((v) => parseInt(v, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function formatDateHuman(iso: string): string {
  const d = isoToDate(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function StepsScreen() {
  const G = useTheme();
  const { uid: ctxUid } = useActiveUid();
  const isDemo = useIsDemo();

  // В демо — всегда используем стабильный demo-uid
  const uid = isDemo ? "demo-uid" : ctxUid ?? auth.currentUser?.uid ?? null;

  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [steps, setSteps] = useState<number>(0); // "сырые" шаги с устройства (с начала суток)
  const [loading, setLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>("");

  const [history, setHistory] = useState<HistoryItem[]>([]);

  // V2: выбранная дата и дневной результат движка
  const [currentDate, setCurrentDate] = useState<string>(todayKey());
  const [dayResult, setDayResult] = useState<StepEngineDayResult | null>(null);

  // Простая локальная формула превью GAD Points (только визуальная связка)
  function estimateGadPoints(localSteps: number): number {
    // Пример: каждые 1 000 шагов ≈ 10 GAD Points (preview)
    if (!localSteps || localSteps <= 0) return 0;
    return Math.floor(localSteps / 1000) * 10;
  }

  const localTodayGadPreview: number = estimateGadPoints(steps);
  const todayIso = todayKey();

  // --- DEMO history + demo dayResult ---
  function loadDemoHistory() {
    const today = new Date();
    const days: HistoryItem[] = [];

    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const id = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const demoSteps = 6500 + i * 800;
      days.push({
        id,
        steps: demoSteps,
        gad: estimateGadPoints(demoSteps),
        status: "demo",
      });
    }

    setHistory(days);

    // По умолчанию — сегодняшний день
    const first = days[0];
    if (first) {
      setCurrentDate(first.id);

      const gad = estimateGadPoints(first.steps);
      const demoDay: StepEngineDayResult = {
        uid: uid ?? "demo-uid",
        date: first.id,
        familyId: null,
        subscriptionTier: "free",
        totalSteps: first.steps,
        stepsCounted: first.steps,
        gadPreview: gad.toFixed(6),
        gadEarned: gad.toFixed(6),
        status: "ok", // тип StepEngineDayStatus, без "demo"
        limit: {
          dailyMaxSteps: 10000,
          applied: false,
          reason: "none",
          stepsBeforeCap: first.steps,
          stepsAfterCap: first.steps,
        },
        bonusFlags: {
          subscriptionBoostApplied: false,
        },
        zoneBonusSteps: 0,
        zoneBonusGad: "0",
        meta: {
          dryRun: true,
        },
      } as StepEngineDayResult;

      setDayResult(demoDay);
    }
  }

  // История rewards/{uid}/days/{date} (реальный режим, результат Step Engine V2)
  async function loadHistory() {
    try {
      if (isDemo) {
        loadDemoHistory();
        return;
      }

      if (!uid) {
        setHistory([]);
        return;
      }

      // rewards/{uid}/days/{date}
      const colRef = collection(db, "rewards", uid, "days");
      const qRef = query(colRef, orderBy("date", "desc"));

      const snap = await getDocs(qRef);
      const arr: HistoryItem[] = [];

      snap.forEach((d) => {
        const data = d.data() as any;
        arr.push({
          id: data.date || d.id, // YYYY-MM-DD
          // StepEngineV2 пишет totalSteps; fallback — stepsCounted / steps
          steps: Number(
            data.totalSteps ?? data.stepsCounted ?? data.steps ?? 0
          ),
          // GAD: используем gadEarned (результат движка), fallback — gadPreview
          gad: data.gadEarned ?? data.gadPreview ?? null,
          status: data.status ?? null,
        });
      });

      setHistory(arr);
    } catch (e) {
      console.log("loadHistory error", e);
    }
  }

  // Загрузка результата движка для currentDate
  async function loadDayResultForDate(dateISO: string) {
    try {
      if (isDemo) {
        // В демо режим: ищем в history нужный день и строим фейковый результат
        const item =
          history.find((h) => h.id === dateISO) ??
          history.find((h) => h.id === history[0]?.id);
        if (!item) {
          setDayResult(null);
          return;
        }

        const gadNumber =
          typeof item.gad === "number"
            ? item.gad
            : item.gad != null
            ? Number(item.gad)
            : estimateGadPoints(item.steps);

        const demoDay: StepEngineDayResult = {
          uid: uid ?? "demo-uid",
          date: item.id,
          familyId: null,
          subscriptionTier: "free",
          totalSteps: item.steps,
          stepsCounted: item.steps,
          gadPreview: gadNumber.toFixed(6),
          gadEarned: gadNumber.toFixed(6),
          status: "ok",
          limit: {
            dailyMaxSteps: 10000,
            applied: false,
            reason: "none",
            stepsBeforeCap: item.steps,
            stepsAfterCap: item.steps,
          },
          bonusFlags: {
            subscriptionBoostApplied: false,
          },
          zoneBonusSteps: 0,
          zoneBonusGad: "0",
          meta: {
            dryRun: true,
          },
        } as StepEngineDayResult;

        setDayResult(demoDay);
        return;
      }

      if (!uid) {
        setDayResult(null);
        return;
      }

      const res = await fetchRewardForDate(uid, dateISO);
      setDayResult(res);
    } catch (e) {
      console.log("loadDayResultForDate error", e);
      setDayResult(null);
    }
  }

  // Чтение шагов с устройства (с начала суток) — только в реальном режиме
  async function refreshSteps() {
    try {
      setLoading(true);
      setSyncMessage("");

      if (isDemo) {
        // DEMO: эмуляция шагов
        const base = 8200;
        const jitter = Math.floor(Math.random() * 2500);
        const demoSteps = base + jitter;
        setSteps(demoSteps);
        setSyncMessage("Demo: steps are simulated.");
        return;
      }

      if (isAvailable === false) {
        setSyncMessage("Step counting is not available on this device.");
        return;
      }

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();

      const res = await Pedometer.getStepCountAsync(start, end);
      setSteps(res.steps ?? 0);
    } catch (e) {
      console.log("refreshSteps error", e);
      setSyncMessage("Cannot read steps on this device.");
    } finally {
      setLoading(false);
    }
  }

  // Инициализация: доступность педометра + история
  useEffect(() => {
    (async () => {
      if (isDemo) {
        setIsAvailable(true);
        await refreshSteps();
        await loadHistory();
        return;
      }

      try {
        const available = await Pedometer.isAvailableAsync();
        setIsAvailable(available);
        if (available) {
          await refreshSteps();
        } else {
          setSyncMessage("Step counting is not available on this device.");
        }
      } catch (e) {
        console.log("Pedometer availability error", e);
        setIsAvailable(false);
        setSyncMessage("Step counting is not available on this device.");
      }

      await loadHistory();
      // для текущей даты загрузим результат отдельно ниже
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, isDemo]);

  // При смене currentDate / history — тянем дневной результат
  useEffect(() => {
    loadDayResultForDate(currentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, history, uid, isDemo]);

  // Сохранить шаги в dailySteps/{uid}/days/{date} (реальный режим)
  async function saveToCloud() {
    if (isDemo) {
      setSyncMessage(
        "Demo: steps are not sent to backend. This is a local preview."
      );
      return;
    }

    if (!uid) {
      setSyncMessage("No user, cannot sync steps.");
      return;
    }

    try {
      setLoading(true);
      setSyncMessage("");

      const dateId = todayKey();
      const ref = doc(db, "dailySteps", uid, "days", dateId);

      await setDoc(
        ref,
        {
          steps,
          updatedAt: serverTimestamp(),
          platform: Platform.OS,
        },
        { merge: true }
      );

      setSyncMessage("Steps synced to cloud.");
    } catch (e) {
      console.log("saveToCloud error", e);
      setSyncMessage("Failed to sync steps to cloud.");
    } finally {
      setLoading(false);
      await loadHistory();
      // если выбран сегодня — подтянем dayResult отдельно
      if (currentDate === todayIso && uid && !isDemo) {
        const res = await fetchRewardForDate(uid, todayIso);
        setDayResult(res);
      }
    }
  }

  // Сохранить и запустить конверсию (stepEngineRunNow — глобальный V2) — только не в демо
  async function syncAndPreviewRewards() {
    if (isDemo) {
      setSyncMessage(
        "Demo: rewards preview is simulated. Step Engine V2 will convert steps into GAD Points on backend."
      );
      await loadHistory();
      return;
    }

    if (!uid) {
      setSyncMessage("No user, cannot run rewards preview.");
      return;
    }

    try {
      setLoading(true);
      setSyncMessage("");

      await saveToCloud();

      const call = fn<
        unknown,
        { ok: boolean; processed: number; date: string }
      >("stepEngineRunNow");

      const res = await call({});
      setSyncMessage(
        `Rewards preview updated for ${res.data?.date ?? "today"}.`
      );

      // После перерасчёта тянем актуальный результат за сегодня
      const latest = await fetchRewardForDate(uid, todayIso);
      if (currentDate === todayIso) {
        setDayResult(latest);
      }
    } catch (e) {
      console.log("syncAndPreviewRewards error", e);
      setSyncMessage("Error while running rewards preview.");
    } finally {
      setLoading(false);
      await loadHistory();
      if (currentDate === todayIso && uid && !isDemo) {
        const res = await fetchRewardForDate(uid, todayIso);
        setDayResult(res);
      }
    }
  }

  // -----------------------------
  // Selected day: данные из dayResult + fallback
  // -----------------------------

  const isTodaySelected = currentDate === todayIso;

  const engineSteps: number | null =
    dayResult != null
      ? Number(
          (dayResult as any).totalSteps ??
            (dayResult as any).stepsCounted ??
            (dayResult as any).steps ??
            0
        )
      : null;

  const effectiveSteps: number =
    engineSteps != null && Number.isFinite(engineSteps) && engineSteps >= 0
      ? engineSteps
      : isTodaySelected
      ? steps
      : 0;

  const stepsLabel =
    isAvailable === false && !isDemo
      ? "Not available"
      : loading
      ? "Loading…"
      : `${formatSteps(effectiveSteps)} steps`;

  // GAD preview / earned
  let gadPreviewDisplay: string = "0";
  if (dayResult?.gadPreview != null) {
    gadPreviewDisplay = String(dayResult.gadPreview);
  } else if (isTodaySelected && !dayResult && localTodayGadPreview > 0) {
    gadPreviewDisplay = localTodayGadPreview.toLocaleString("en-US");
  }

  let gadEarnedDisplay: string = "0";
  if (dayResult?.gadEarned != null) {
    gadEarnedDisplay = String(dayResult.gadEarned);
  }

  const statusLabel: string =
    dayResult?.status ?? (dayResult ? "ok" : "no-data");

  const hasLimit =
    !!dayResult &&
    !!dayResult.limit &&
    dayResult.limit.applied &&
    dayResult.limit.reason !== "none";

  const hasSubscriptionBoost =
    !!dayResult?.bonusFlags?.subscriptionBoostApplied;

  const selectedDateHuman = formatDateHuman(currentDate);

  // Навигация по датам
  function goPrevDay() {
    setCurrentDate((prev) => shiftDate(prev, -1));
  }

  function goNextDay() {
    setCurrentDate((prev) => {
      const next = shiftDate(prev, 1);
      // Не выходим в будущее
      return next > todayIso ? prev : next;
    });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: G.colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text style={{ color: G.colors.text, fontSize: 22, fontWeight: "700" }}>
        Steps Tracker
        {isDemo ? " (demo)" : ""}
      </Text>

      <Text style={{ color: G.colors.textMuted, marginTop: 6, fontSize: 13 }}>
        View your daily steps and rewards. Step Engine V2 converts your steps
        into GAD Points — with limits, status and future bonuses.
      </Text>

      {/* Date selector */}
      <View
        style={{
          marginTop: 16,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Button title="Previous day" onPress={goPrevDay} />
        <Text
          style={{
            color: G.colors.text,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {selectedDateHuman}
        </Text>
        <Button
          title="Next day"
          onPress={goNextDay}
          disabled={currentDate >= todayIso}
        />
      </View>

      {/* Selected day card */}
      <View
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 14,
          backgroundColor: G.colors.card,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text
          style={{ color: G.colors.textMuted, fontSize: 13, marginBottom: 4 }}
        >
          Selected day
        </Text>

        <Text
          style={{
            color: G.colors.accent,
            fontSize: 32,
            fontWeight: "700",
            marginTop: 6,
          }}
        >
          {stepsLabel}
        </Text>

        <View style={{ marginTop: 8 }}>
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 13,
            }}
          >
            GAD preview: {gadPreviewDisplay} GAD Points
          </Text>
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 13,
              marginTop: 2,
            }}
          >
            GAD earned: {gadEarnedDisplay} GAD Points
          </Text>
        </View>

        <Text
          style={{
            color: G.colors.textMuted,
            marginTop: 6,
            fontSize: 12,
          }}
        >
          Status: {statusLabel}
        </Text>

        {!isDemo && hasLimit && dayResult?.limit && (
          <Text
            style={{
              color: G.colors.textMuted,
              marginTop: 4,
              fontSize: 12,
            }}
          >
            Limited by: {dayResult.limit.reason} — counted{" "}
            {formatSteps(dayResult.limit.stepsAfterCap)} steps
            {typeof dayResult.limit.dailyMaxSteps === "number"
              ? ` (daily cap ${formatSteps(
                  dayResult.limit.dailyMaxSteps
                )})`
              : ""}
          </Text>
        )}

        {!isDemo && hasSubscriptionBoost && (
          <Text
            style={{
              color: G.colors.accent,
              marginTop: 4,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            Subscription boost
          </Text>
        )}

        <Text
          style={{
            color: G.colors.textMuted,
            marginTop: 4,
            fontSize: 12,
          }}
        >
          Source:{" "}
          {isDemo
            ? "Simulated for demo"
            : "Device pedometer + Step Engine V2 (rewards)"}
        </Text>
      </View>

      {/* Actions */}
      <View style={{ marginTop: 24, gap: 12 }}>
        {loading && !isDemo && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 4,
              gap: 8,
            }}
          >
            <ActivityIndicator color={G.colors.accent} />
            <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
              Working with steps…
            </Text>
          </View>
        )}

        <Button
          title={isDemo ? "Refresh demo steps" : "Refresh steps"}
          onPress={refreshSteps}
          disabled={(isAvailable === false && !isDemo) || loading}
        />
        <Button
          title={isDemo ? "Demo sync (no backend)" : "Sync steps to cloud"}
          onPress={saveToCloud}
          disabled={(isAvailable === false && !isDemo) || loading}
        />
        <Button
          title={
            isDemo
              ? "Preview Step Engine (demo)"
              : "Sync & preview rewards (Step Engine V2)"
          }
          onPress={syncAndPreviewRewards}
          disabled={(isAvailable === false && !isDemo) || loading}
        />
      </View>

      {!!syncMessage && (
        <Text
          style={{
            color: G.colors.textMuted,
            marginTop: 16,
            fontSize: 13,
          }}
        >
          {syncMessage}
        </Text>
      )}

      {/* HISTORY */}
      <View
        style={{
          marginTop: 30,
          borderTopWidth: 1,
          borderTopColor: G.colors.border,
          paddingTop: 16,
        }}
      >
        <Text
          style={{
            color: G.colors.text,
            fontWeight: "700",
            fontSize: 16,
            marginBottom: 10,
          }}
        >
          History
        </Text>

        {history.length === 0 ? (
          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            No history yet. Once you sync, daily step stats and GAD previews
            will appear here.
          </Text>
        ) : (
          history.map((h) => (
            <View
              key={h.id}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: G.colors.border,
              }}
            >
              <Text style={{ color: G.colors.text }}>
                {h.id}: {formatSteps(h.steps)} steps
              </Text>
              {h.gad && (
                <Text style={{ color: G.colors.accent, fontSize: 12 }}>
                  ≈ {h.gad} GAD Points
                </Text>
              )}
              {h.status && (
                <Text style={{ color: G.colors.textMuted, fontSize: 11 }}>
                  status: {h.status}
                </Text>
              )}
            </View>
          ))
        )}
      </View>

      {Platform.OS === "ios" && !isDemo && (
        <Text
          style={{ color: G.colors.textMuted, marginTop: 16, fontSize: 12 }}
        >
          iOS requires enabling Motion & Fitness access in Settings → Privacy →
          Motion & Fitness.
        </Text>
      )}
    </ScrollView>
  );
}

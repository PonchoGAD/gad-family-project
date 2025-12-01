// ---------------------------------------------------------------
// apps/mobile/src/wallet/ui/theme.ts
// Global UI theme helper for GAD Family App
//
//  - single hook: useTheme()
//  - dark / light palettes (по умолчанию премиальный dark)
//  - используется во всех экранах: G.colors.*
// ---------------------------------------------------------------

import { useColorScheme } from "react-native";

/**
 * Цветовая палитра под GAD:
 *  - тёмный космический фон
 *  - карточки в стиле obsidian / slate
 *  - акцент — мягкое золото (GAD-код)
 */
export type ThemeColors = {
  // Базовый фон
  bg: string;
  bgAlt: string;

  // Карточки
  card: string;
  cardSoft: string;
  cardStrong: string;

  // Оверлеи
  overlay: string;
  bgOverlay: string;

  // Бордеры
  border: string;
  borderMuted: string;
  borderSoft: string;

  // Текст
  text: string;
  textMuted: string;
  textSoft: string;

  // Акценты
  accent: string;
  accentSoft: string;
  accentStrong: string;

  // Специальные акценты для демо-блоков
  demoAccent: string;
  demoBorder: string;

  // Статусы
  danger: string;
  warning: string;
  success: string;
  info: string;

  // Основной бренд-цвет (обычно совпадает с accent)
  primary: string;

  // Инпуты
  input: string;
  inputBg: string;

  // Состояние disabled
  buttonDisabled: string;

  // Чипы, теги и кнопки-дополнения
  chipBg: string;
};

export type AppTheme = {
  colors: ThemeColors;
};

const darkTheme: AppTheme = {
  colors: {
    // Основной фон приложения
    bg: "#020617", // almost-black / deep navy
    bgAlt: "#020617",

    // Карточки и панели
    card: "#0b1120", // obsidian
    cardSoft: "#020617", // мягкая карта, чуть ближе к фону
    cardStrong: "#020617", // усиленная карта / важные блоки

    // Оверлеи (модалки, затемнения)
    overlay: "rgba(15,23,42,0.94)",
    bgOverlay: "rgba(2,6,23,0.9)",

    // Бордеры
    border: "rgba(148,163,184,0.55)", // slate-400/500 mix
    borderMuted: "rgba(55,65,81,0.7)", // gray-700
    borderSoft: "rgba(148,163,184,0.25)",

    // Текст
    text: "#f9fafb", // near white
    textMuted: "#9ca3af", // slate-400
    textSoft: "#9ca3af", // мягкий текст (alias textMuted)

    // GAD-акцент — золотой, мягкий, без кислотности
    accent: "#facc15", // amber-400
    accentSoft: "rgba(250,204,21,0.16)",
    accentStrong: "#fbbf24", // amber-300/400 mix

    // Спец-акценты для демо-карточек
    demoAccent: "#facc15",
    demoBorder: "rgba(250,204,21,0.5)",

    // Статусы
    danger: "#f97373",
    warning: "#f97316", // тёплый оранжевый
    success: "#22c55e",
    info: "#38bdf8",

    // Основной бренд-цвет (можно использовать как primary-button)
    primary: "#facc15",

    // Инпуты
    input: "#020617",
    inputBg: "#020617",

    // Disabled состояние кнопок
    buttonDisabled: "rgba(148,163,184,0.3)",

    // Чипы, теги и кнопки-дополнения
    chipBg: "#020617",
  },
};

const lightTheme: AppTheme = {
  colors: {
    // На всякий случай — если система в light-режиме
    bg: "#f9fafb",
    bgAlt: "#e5e7eb",

    card: "#ffffff",
    cardSoft: "#f3f4f6",
    cardStrong: "#e5e7eb",

    overlay: "rgba(15,23,42,0.06)",
    bgOverlay: "rgba(15,23,42,0.08)",

    border: "rgba(148,163,184,0.7)",
    borderMuted: "rgba(209,213,219,0.9)",
    borderSoft: "rgba(148,163,184,0.3)",

    text: "#020617",
    textMuted: "#6b7280",
    textSoft: "#9ca3af",

    accent: "#eab308",
    accentSoft: "rgba(234,179,8,0.12)",
    accentStrong: "#ca8a04",

    demoAccent: "#eab308",
    demoBorder: "rgba(234,179,8,0.6)",

    danger: "#dc2626",
    warning: "#f97316",
    success: "#16a34a",
    info: "#0284c7",

    primary: "#eab308",

    input: "#ffffff",
    inputBg: "#f9fafb",

    buttonDisabled: "rgba(148,163,184,0.4)",

    chipBg: "#e5e7eb",
  },
};

/**
 * useTheme:
 *  - без лишних провайдеров
 *  - автоматически смотрит режим системы (dark/light)
 *  - для инвест-демо основной сценарий — darkTheme
 */
export function useTheme(): AppTheme {
  const scheme = useColorScheme();

  // Если хочешь принудительно всегда dark, можно просто вернуть darkTheme.
  if (scheme === "light") {
    return lightTheme;
  }
  return darkTheme;
}

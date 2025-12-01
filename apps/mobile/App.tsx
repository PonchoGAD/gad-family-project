// apps/mobile/App.tsx
// ---------------------------------------------
// Entry point приложения:
//  - polyfills для crypto / URL
//  - ensureAuth + ensureUserDoc
//  - RootNavigator (Stack + Tabs) из src/navigation
//  - DemoProvider для demo-mode (sample family)
// ---------------------------------------------

import "react-native-get-random-values"; // crypto polyfill для ethers
import "react-native-url-polyfill/auto";

import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ensureAuth } from "./src/lib/authClient";
import { ensureUserDoc } from "./src/lib/user";
import { RootNavigator } from "./src/navigation";
import { DemoProvider } from "./src/demo/DemoContext";

export default function App() {
  useEffect(() => {
    (async () => {
      try {
        const u = await ensureAuth();
        if (u) {
          await ensureUserDoc();
        }
      } catch (e) {
        console.log("Auth init error", e);
      }
    })();
  }, []);

  return (
    <DemoProvider>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </DemoProvider>
  );
}

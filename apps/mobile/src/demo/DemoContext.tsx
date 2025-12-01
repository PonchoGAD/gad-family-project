// ---------------------------------------------------------------
// apps/mobile/src/demo/DemoContext.tsx
// Global demo-mode context for investor / sample family
// ---------------------------------------------------------------

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import { auth } from "../firebase";
import { getCurrentUserFamilyId } from "../lib/families";

/**
 * Fixed demo identifiers.
 * These should correspond to prepared Firestore documents:
 *  - users/DEMO_UID
 *  - families/DEMO_FID
 * with prefilled steps, rewards, missions, map, etc.
 */
export const DEMO_UID = "demo-investor-uid";
export const DEMO_FID = "demo-investor-family";

/**
 * Shape of the demo context.
 */
export type DemoContextValue = {
  /** Is global demo mode enabled (sample family instead of real data) */
  isDemo: boolean;

  /** Toggle demo mode on/off */
  setDemo: (on: boolean) => void;

  /**
   * Returns the "active" uid:
   *  - DEMO_UID if demo-mode is ON
   *  - auth.currentUser?.uid if demo-mode is OFF
   *  - null if no user is logged in
   */
  getActiveUid: () => string | null;

  /**
   * Returns the "active" familyId:
   *  - DEMO_FID if demo-mode is ON
   *  - getCurrentUserFamilyId() if demo-mode is OFF
   *  - null if user is not in a family
   */
  getActiveFamilyId: () => Promise<string | null>;
};

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

type DemoProviderProps = {
  children: React.ReactNode;
};

/**
 * DemoProvider:
 *  - holds isDemo flag in memory (per app session)
 *  - routes helper calls to real user / demo user
 *
 * IMPORTANT:
 *  Wrap your root navigator (App.tsx / RootNavigator) with DemoProvider,
 *  so all screens can use useDemo().
 */
export function DemoProvider({ children }: DemoProviderProps) {
  const [isDemo, setIsDemo] = useState(false);

  const setDemo = useCallback((on: boolean) => {
    setIsDemo(on);
  }, []);

  const getActiveUid = useCallback((): string | null => {
    if (isDemo) return DEMO_UID;
    return auth.currentUser?.uid ?? null;
  }, [isDemo]);

  const getActiveFamilyId = useCallback(async (): Promise<string | null> => {
    if (isDemo) {
      // In demo-mode we always route to pre-configured family id
      return DEMO_FID;
    }
    // Normal flow: use actual family of logged-in user
    return await getCurrentUserFamilyId();
  }, [isDemo]);

  const value: DemoContextValue = useMemo(
    () => ({
      isDemo,
      setDemo,
      getActiveUid,
      getActiveFamilyId,
    }),
    [isDemo, setDemo, getActiveUid, getActiveFamilyId]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

/**
 * Hook to access demo-mode context.
 */
export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error("useDemo must be used within a DemoProvider");
  }
  return ctx;
}

/**
 * Convenience hooks:
 *  - useActiveUid(): { uid, isDemo }
 *  - useActiveFamilyId(): { fid, isDemo, loading }
 *  - useIsDemo(): boolean
 */

export function useActiveUid(): { uid: string | null; isDemo: boolean } {
  const { isDemo, getActiveUid } = useDemo();
  const uid = getActiveUid();
  return { uid, isDemo };
}

export function useActiveFamilyId(): {
  fid: string | null;
  isDemo: boolean;
  loading: boolean;
} {
  const { isDemo, getActiveFamilyId } = useDemo();
  const [fid, setFid] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getActiveFamilyId()
      .then((id) => {
        if (!cancelled) {
          setFid(id);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getActiveFamilyId]);

  return { fid, isDemo, loading };
}

export function useIsDemo(): boolean {
  const { isDemo } = useDemo();
  return isDemo;
}

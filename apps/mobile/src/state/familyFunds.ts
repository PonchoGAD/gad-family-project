import * as React from "react";

export type Fund = {
  id: string;
  name: string;
  percent: number; // % отчислений из казны
  status: "active" | "pendingUnlock" | "unlocked";
  createdAt: number;
  balance?: number;
  target?: number;
};

type State = {
  funds: Fund[];
  unlockable: Fund[];
  createFund: (f: Pick<Fund, "name" | "percent">) => void;
  contribute: (id: string, amount: number) => void;
  simulateCycle: () => void;
};

const Ctx = React.createContext<State | null>(null);

const genId = () =>
  (globalThis as any)?.crypto?.randomUUID?.() ??
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export function FamilyFundsProvider(props: { children: React.ReactNode }) {
  const [funds, setFunds] = React.useState<Fund[]>([]);

  const createFund = (f: Pick<Fund, "name" | "percent">) =>
    setFunds((prev) => [
      ...prev,
      { id: genId(), name: f.name, percent: f.percent, status: "active", createdAt: Date.now(), balance: 0 },
    ]);

  const contribute = (id: string, amount: number) =>
    setFunds((prev) => prev.map((x) => (x.id === id ? { ...x, balance: (x.balance ?? 0) + amount } : x)));

  const simulateCycle = () =>
    setFunds((prev) =>
      prev.map((x) =>
        Date.now() - x.createdAt > 21 * 24 * 3600 * 1000 && x.status === "active"
          ? { ...x, status: "pendingUnlock" }
          : x
      )
    );

  const unlockable = funds.filter((f) => f.status === "pendingUnlock");
  const value: State = { funds, unlockable, createFund, contribute, simulateCycle };

  // Без JSX, чтобы файл мог оставаться .ts
  return React.createElement(Ctx.Provider, { value }, props.children as any);
}

export function useFamilyFunds() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("FamilyFundsProvider missing");
  return ctx;
}

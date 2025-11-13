// web/src/App.tsx
import "./App.css";

type TreasuryConfig = {
  token: string;
  teamFinanceLock: string;
  treasurySafe: string;
  distributionSafe: string;
  hotPayoutWallet: string;
  lockStart: string;      // YYYY-MM-DD
  tranches: number;
  monthsBetween: number;
};

const TREASURY: TreasuryConfig = {
  // Эти значения можно потом вынести в .env или JSON, пока — как в остальной экосистеме
  token: "0x858bab88A5b8d7f29a40380c5f2d8d0b8812FE62",
  teamFinanceLock: "0x0000000000000000000000000000000000000000", // подставишь реальный lock позже
  treasurySafe: "0xe08F53ac892E89b6Ba431b90A96C640A39386736",
  distributionSafe: "0xe08F53ac892E89b6Ba431b90A96C640A39386736",
  hotPayoutWallet: "0x0000000000000000000000000000000000000000", // подставишь позже
  lockStart: "2025-11-24",
  tranches: 10,
  monthsBetween: 6,
};

function bsc(addr: string) {
  return `https://bscscan.com/address/${addr}`;
}

function short(addr: string) {
  if (!addr) return "—";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function buildTranches(startISO: string, count: number, months: number): string[] {
  const out: string[] = [];
  const base = new Date(startISO + "T00:00:00Z");
  for (let i = 1; i <= count; i++) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + months * i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function nextUnlock(dates: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  const next = dates.find((d) => d >= today) ?? null;
  const index = next ? dates.indexOf(next) + 1 : dates.length;
  return { next, index };
}

function App() {
  const dates = buildTranches(TREASURY.lockStart, TREASURY.tranches, TREASURY.monthsBetween);
  const { next, index } = nextUnlock(dates);
  const progress = Math.round((index / TREASURY.tranches) * 100);

  const rows: Array<[string, string]> = [
    ["GAD Token", TREASURY.token],
    ["TeamFinance Lock", TREASURY.teamFinanceLock],
    ["Treasury SAFE", TREASURY.treasurySafe],
    ["Distribution SAFE", TREASURY.distributionSafe],
    ["Hot Payout Wallet", TREASURY.hotPayoutWallet],
  ];

  return (
    <div className="gad-root">
      <header className="gad-header">
        <div>
          <h1>GAD Family · Dev Dashboard</h1>
          <p>
            Internal web panel for the GAD ecosystem: transparency, treasury info and developer
            shortcuts. Mobile app handles Move-to-Earn and family features.
          </p>
        </div>
        <div className="gad-header-links">
          <a href="https://gad-family.com" target="_blank" rel="noreferrer">
            gad-family.com
          </a>
          <a href="https://bscscan.com/token/0x858bab88A5b8d7f29a40380c5f2d8d0b8812FE62" target="_blank" rel="noreferrer">
            GAD on BscScan
          </a>
        </div>
      </header>

      <main className="gad-grid">
        {/* Блок прозрачности Treasury */}
        <section className="gad-card">
          <h2>GAD Treasury Transparency</h2>
          <p className="gad-muted">
            5T GAD planned to be locked and released in {TREASURY.tranches} tranches of 500B every{" "}
            {TREASURY.monthsBetween} months to the Distribution SAFE.
          </p>

          <div className="gad-progress-wrap">
            <div className="gad-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="gad-muted-small">
            Completed {index}/{TREASURY.tranches} · Next unlock:{" "}
            <strong>{next ?? "All released"}</strong>
          </p>

          <div className="gad-row-list">
            {rows.map(([label, addr]) => (
              <div key={label} className="gad-row">
                <span className="gad-label">{label}</span>
                {addr ? (
                  <a href={bsc(addr)} target="_blank" rel="noreferrer" className="gad-link">
                    {short(addr)}
                  </a>
                ) : (
                  <span className="gad-empty">—</span>
                )}
              </div>
            ))}
          </div>

          <details className="gad-details">
            <summary>Full unlock schedule</summary>
            <ul>
              {dates.map((d, i) => (
                <li key={d}>
                  {i + 1}. {d} — 500B GAD
                </li>
              ))}
            </ul>
          </details>
        </section>

        {/* Блок с инструкциями / шорткатами для разработки */}
        <section className="gad-card">
          <h2>Developer shortcuts</h2>
          <ul className="gad-list">
            <li>
              <strong>Mobile app (Expo):</strong> run <code>pnpm dev:app</code> or your Expo script
              to launch <code>apps/mobile</code>.
            </li>
            <li>
              <strong>Cloud Functions:</strong> callable names are{" "}
              <code>stepEngineRunNow</code>, <code>getTreasuryStatus</code>,{" "}
              <code>requestPayout</code>, <code>buildApproveCalldata</code>,{" "}
              <code>adminDoApprove</code>, <code>geo_ping</code>.
            </li>
            <li>
              <strong>RPC / Chain:</strong> BNB Smart Chain mainnet (id 56). RPC configured via
              env: <code>EXPO_PUBLIC_RPC_URL</code> / <code>RPC_BSC</code>.
            </li>
            <li>
              <strong>DAO & xGAD:</strong> governance + staking contracts are already deployed on
              BSC. Web dashboard can later integrate voting and staking views here.
            </li>
          </ul>

          <p className="gad-muted-small">
            This page is static, safe by design and can be extended later with live on-chain reads
            (Treasury balance, LP stats, NFT marketplace, etc.).
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;

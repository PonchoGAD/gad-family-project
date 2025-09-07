import cfg from "../config/treasury.json";
import { buildTranches, nextUnlock } from "../lib/schedule";

const link = (a:string) => `https://bscscan.com/address/${a}`;
const short = (a:string) => a.slice(0,6)+"…"+a.slice(-4);

export default function TreasuryTransparency(){
  const dates = buildTranches(cfg.lockStart, cfg.tranches, cfg.monthsBetween);
  const { next, index } = nextUnlock(dates);
  const progress = Math.round((index / cfg.tranches) * 100);

  const rows = [
    ["GAD Token", cfg.token],
    ["TeamFinance Lock", cfg.teamFinanceLock],
    ["Treasury SAFE", cfg.treasurySafe],
    ["Distribution SAFE", cfg.distributionSafe],
    ["Hot Payout Wallet", cfg.hotPayoutWallet],
  ];

  return (
    <section style={card}>
      <h2 style={{margin:0}}>GAD Treasury Transparency</h2>
      <p style={{opacity:.8, marginTop:8}}>
        5T locked in TeamFinance. Unlocks: 10 × 500B every {cfg.monthsBetween} months → to Distribution SAFE.
      </p>

      <div style={barWrap}>
        <div style={{...barFill, width: `${progress}%`}}/>
      </div>
      <p style={{opacity:.8, marginTop:6}}>Completed {index}/{cfg.tranches} • Next unlock: <b>{next ?? "All released"}</b></p>

      <div style={{marginTop:12}}>
        {rows.map(([label, addr])=>(
          <div key={label} style={row}>
            <span style={{opacity:.8}}>{label}</span>
            <a href={link(addr)} target="_blank" rel="noreferrer" style={a}>
              {short(addr)}
            </a>
          </div>
        ))}
      </div>

      <details style={{marginTop:12}}>
        <summary>Full schedule</summary>
        <ul>
          {dates.map((d,i)=> <li key={d}>{i+1}. {d} — 500B</li>)}
        </ul>
      </details>
    </section>
  );
}

const card: React.CSSProperties = { padding:16, borderRadius:12, background:"#0b0c10", color:"#fff", border:"1px solid #1f2330" };
const barWrap: React.CSSProperties = { height:10, background:"#1f2330", borderRadius:6, overflow:"hidden", marginTop:8 };
const barFill: React.CSSProperties = { height:"100%", background:"#4ade80" };
const row: React.CSSProperties = { display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px dashed #1f2330" };
const a: React.CSSProperties = { color:"#6aa9ff", textDecoration:"none" };

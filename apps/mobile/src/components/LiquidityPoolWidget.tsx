"use client";
import React from "react";

type LiquidityPoolWidgetProps = {
  defaultPairAddress?: string; // 0x... pair on BSC
  defaultTab?: "dex" | "gecko";
};

export default function LiquidityPoolWidget({
  defaultPairAddress = "",
  defaultTab = "dex",
}: LiquidityPoolWidgetProps) {
  const PAIR_KEY = "gad_lp_pair_bsc";
  const TAB_KEY  = "gad_lp_tab";

  const [pair, setPair] = React.useState<string>("");
  const [tab, setTab]   = React.useState<"dex" | "gecko">(defaultTab);

  React.useEffect(()=>{
    const savedPair = localStorage.getItem(PAIR_KEY) || defaultPairAddress || "";
    const savedTab  = (localStorage.getItem(TAB_KEY) as "dex"|"gecko") || defaultTab;
    setPair(savedPair);
    setTab(savedTab);
  }, [defaultPairAddress, defaultTab]);

  React.useEffect(()=>{
    localStorage.setItem(PAIR_KEY, pair);
  }, [pair]);

  React.useEffect(()=>{
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const [input, setInput] = React.useState("");

  React.useEffect(()=>{ setInput(pair); }, [pair]);

  const valid = (v:string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());

  const src = React.useMemo(()=>{
    if(!valid(pair)) return "about:blank";
    return tab === "dex"
      ? `https://dexscreener.com/bsc/${pair}?embed=1&theme=dark`
      : `https://www.geckoterminal.com/bsc/pools/${pair}?embed=1&info=1&swaps=1`;
  }, [pair, tab]);

  return (
    <div className="card" style={{marginTop:12}}>
      <div className="row" style={{justifyContent:"space-between", alignItems:"center"}}>
        <h2 style={{margin:0}}>Liquidity Pool</h2>
        <div className="tabs" role="tablist">
          <button
            className={`tab ${tab==="dex"?"tabActive":""}`}
            onClick={()=>setTab("dex")}
            aria-selected={tab==="dex"}
          >
            DexScreener
          </button>
          <button
            className={`tab ${tab==="gecko"?"tabActive":""}`}
            onClick={()=>setTab("gecko")}
            aria-selected={tab==="gecko"}
          >
            GeckoTerminal
          </button>
        </div>
      </div>

      <div className="row" style={{marginTop:10, gap:8}}>
        <input
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          placeholder="Paste BSC pair address (0x...)"
          className="kbd"
          style={{width:"360px", maxWidth:"100%"}}
        />
        <button
          className="btn"
          onClick={()=>{
            if(!valid(input)){ alert("Please paste a valid BSC pair address (0x...)"); return; }
            setPair(input.trim());
          }}
        >
          Set Pair
        </button>
        <span className="muted" style={{fontSize:13}}>
          Example: PancakeSwap pool address (BSC). Saved locally.
        </span>
      </div>

      <div className="hr" />

      <div style={{width:"100%", aspectRatio:"16 / 9", background:"#0f1317", border:"1px solid #25303a", borderRadius:12, overflow:"hidden"}}>
        {src==="about:blank" ? (
          <div style={{display:"grid", placeItems:"center", height:"100%", color:"#a3b1c2", fontSize:14}}>
            Paste your <b>pair address</b> and click <b>Set Pair</b> to load the live widget.
          </div>
        ) : (
          <iframe src={src} width="100%" height="100%" style={{border:0}} loading="lazy" />
        )}
      </div>

      <p className="muted" style={{marginTop:8, fontSize:13}}>
        💡 After you create a pool on PancakeSwap, copy the <strong>pair address</strong> and set it above.
        The widget displays price, liquidity, volume, and a live chart.
      </p>
    </div>
  );
}

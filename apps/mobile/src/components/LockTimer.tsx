import { View, Text } from "react-native";
import { nextUnlock } from "../lib/unlock";
import { TREASURY } from "../config/treasury";


function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000*60*60*24));
}

export default function LockTimer() {
  const { next, index, dates } = nextUnlock();
  const total = TREASURY.TRANCHES;
  const completed = index;
  const remaining = total - completed;
  const today = new Date();
  const dNext = next ? new Date(next + "T00:00:00Z") : null;
  const days = dNext ? daysBetween(today, dNext) : 0;

  return (
    <View style={{ padding:16, borderRadius:12, backgroundColor:"#101114" }}>
      <Text style={{ color:"#fff", fontSize:18, fontWeight:"700" }}>Вестинг: каждые 6 месяцев по 500B</Text>
      <Text style={{ color:"#ccc", marginTop:8 }}>
        Следующий анлок: {next ? next : "все транши выполнены"} {dNext ? `(${days} дн.)` : ""}
      </Text>
      <View style={{ height:10, backgroundColor:"#2b2d33", borderRadius:6, marginTop:10, overflow:"hidden" }}>
        <View style={{ width:`${(completed/total)*100}%`, backgroundColor:"#4ade80", height:"100%" }}/>
      </View>
      <Text style={{ color:"#aaa", marginTop:6 }}>
        Завершено {completed}/{total} • Осталось {remaining}
      </Text>
      <Text style={{ color:"#888", marginTop:8, fontSize:12 }}>
        Получатель анлоков: {short(TREASURY.DISTRIBUTION_SAFE)}
      </Text>
    </View>
  );
}

function short(a:string){ return a ? a.slice(0,6)+"…"+a.slice(-4) : ""; }

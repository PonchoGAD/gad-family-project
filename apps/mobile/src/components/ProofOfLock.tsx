import { View, Text, Linking, Pressable } from "react-native";
import { TREASURY } from "../config/treasury";

const bsc = (addr: string) => `https://bscscan.com/address/${addr}`;

export default function ProofOfLock() {
  const rows = [
    ["GAD Token", TREASURY.TOKEN_ADDRESS],
    ["TeamFinance Lock", TREASURY.TEAM_FINANCE_LOCK],
    ["Treasury SAFE", TREASURY.TREASURY_SAFE],
    ["Distribution SAFE", TREASURY.DISTRIBUTION_SAFE],
    ["Hot Payout Wallet", TREASURY.HOT_PAYOUT_WALLET]
  ];

  return (
    <View style={{ padding:16, borderRadius:12, backgroundColor:"#101114" }}>
      <Text style={{ color:"#fff", fontWeight:"700", fontSize:18 }}>Прозрачность фонда</Text>
      {rows.map(([label, addr]) => (
        <Pressable key={label} onPress={()=>Linking.openURL(bsc(addr))} style={{ paddingVertical:8 }}>
          <Text style={{ color:"#aaa" }}>{label}</Text>
          <Text style={{ color:"#4ea1ff" }}>{addr}</Text>
        </Pressable>
      ))}
      <Text style={{ color:"#ccc", marginTop:8, fontSize:12 }}>
        5T заморожено в TeamFinance. Анлок {TREASURY.TRANCHES} траншей × 500B каждые {TREASURY.MONTHS_BETWEEN} мес.
      </Text>
    </View>
  );
}

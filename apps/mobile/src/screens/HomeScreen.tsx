import { View, Text, Button } from "react-native";
import { useEffect, useState } from "react";
import { getAddress } from "../lib/wallet";
import { TREASURY, getTreasuryBalance } from "../lib/treasury";

export default function HomeScreen({ navigation }: any) {
  const [addr, setAddr] = useState<string>("");
  const [treasury, setTreasury] = useState<string>("");

  useEffect(() => {
    (async () => {
      setAddr(await getAddress());
      const bal = await getTreasuryBalance();
      setTreasury(`${bal.pretty} GAD Points`);
    })();
  }, []);

  return (
    <View style={{ padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: "700" }}>Welcome to GAD Family</Text>
      <Text>User wallet: {addr}</Text>
      <Text>Treasury (GAD Points): {TREASURY}</Text>
      <Text>Treasury balance: {treasury}</Text>

      <Button title="Open Wallet" onPress={() => navigation.navigate("Wallet")} />
      <Button title="Steps Tracker" onPress={() => navigation.navigate("Steps")} />
    </View>
  );
}

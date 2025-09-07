import { useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { scheduleDailyReminder } from "../lib/notifications";

export default function SettingsScreen(){
  const [scheduled, setScheduled] = useState(false);

  const onSchedule = async (h:number, m:number) => {
    await scheduleDailyReminder(h, m);
    setScheduled(true);
    Alert.alert("Done", `Daily reminder set at ${h}:${m.toString().padStart(2,"0")}`);
  };

  return (
    <View style={{ padding:24, gap:12 }}>
      <Text style={{ fontWeight:"700", fontSize:18 }}>Settings</Text>
      <Button title="Daily reminder at 9 AM" onPress={() => onSchedule(9,0)} />
      <Button title="Daily reminder at 8 PM" onPress={() => onSchedule(20,0)} />
      <Text style={{ color:"#666" }}>{scheduled ? "Reminder is scheduled." : "No reminder scheduled yet."}</Text>
    </View>
  );
}

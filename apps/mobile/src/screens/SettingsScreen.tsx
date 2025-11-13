import { useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { scheduleDailyReminder } from "../lib/notifications";

export default function SettingsScreen() {
  const [scheduled, setScheduled] = useState(false);

  const onSchedule = async (h: number, m: number) => {
    await scheduleDailyReminder(h, m);
    setScheduled(true);
    Alert.alert(
      "Done",
      `Daily reminder set at ${h}:${m.toString().padStart(2, "0")}`
    );
  };

  return (
    <View style={{ padding: 24, gap: 12, flex: 1, backgroundColor: "#0b0c0f" }}>
      <Text style={{ fontWeight: "700", fontSize: 18, color: "#fff" }}>
        Settings
      </Text>

      <View style={{ gap: 8, marginTop: 8 }}>
        <Text style={{ color: "#9ca3af" }}>
          Daily reminders help your family stay consistent with walking goals.
        </Text>
        <Button title="Daily reminder at 9:00 AM" onPress={() => onSchedule(9, 0)} />
        <Button title="Daily reminder at 8:00 PM" onPress={() => onSchedule(20, 0)} />
      </View>

      <Text style={{ color: "#6b7280", marginTop: 12 }}>
        {scheduled ? "Reminder is scheduled." : "No reminder scheduled yet."}
      </Text>
    </View>
  );
}

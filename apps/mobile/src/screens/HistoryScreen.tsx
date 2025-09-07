import React, { useState } from "react";
import { View, Text, TextInput, Button, Alert, FlatList } from "react-native";
import { fn } from "../firebase";

export default function HistoryScreen() {
  const [targetUid, setTargetUid] = useState("");
  const [fromISO, setFromISO] = useState("2025-09-01T00:00:00.000Z");
  const [toISO, setToISO] = useState("2025-09-04T23:59:59.000Z");
  const [items, setItems] = useState<any[]>([]);

  async function load() {
    try {
      const res: any = await fn.getLocationHistory({ targetUid, fromISO, toISO });
      setItems(res.data.items ?? []);
    } catch (e: any) {
      Alert.alert("Ошибка", e.message ?? String(e));
    }
  }

  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text>UID</Text>
      <TextInput value={targetUid} onChangeText={setTargetUid} style={{borderWidth:1,padding:8}} />
      <Text>From ISO</Text>
      <TextInput value={fromISO} onChangeText={setFromISO} style={{borderWidth:1,padding:8}} />
      <Text>To ISO</Text>
      <TextInput value={toISO} onChangeText={setToISO} style={{borderWidth:1,padding:8}} />
      <Button title="Загрузить" onPress={load} />
      <FlatList data={items}
        keyExtractor={(_,i)=>String(i)}
        renderItem={({item})=>(
          <Text>{item.at} — {item.lat},{item.lng} (±{item.acc ?? "?"}м)</Text>
        )}
      />
    </View>
  );
}

import React, { useState } from "react";
import { View, Text, TextInput, Button, Alert } from "react-native";
import { fn } from "../firebase";

export default function ProfileDOBScreen() {
  const [dob, setDob] = useState("2010-05-12"); // YYYY-MM-DD

  async function save() {
    try {
      const res: any = await fn.registerBirthdate({ dob });
      Alert.alert("OK", `Возраст: ${res.data.age}, взрослый: ${res.data.isAdult}`);
    } catch (e: any) {
      Alert.alert("Ошибка", e.message ?? String(e));
    }
  }

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text>Дата рождения (YYYY-MM-DD)</Text>
      <TextInput value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD"
        style={{ borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 6 }} />
      <Button title="Сохранить" onPress={save} />
    </View>
  );
}

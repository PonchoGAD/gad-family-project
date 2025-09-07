import React, { useState } from "react";
import { View, Text, TextInput, Button, Alert } from "react-native";
import { fn } from "../firebase";

export default function PlacesScreen() {
  const [title, setTitle] = useState("Дом");
  const [type, setType] = useState<"home"|"school"|"custom">("home");
  const [lat, setLat] = useState("42.8746");
  const [lng, setLng] = useState("74.5698");
  const [radius, setRadius] = useState("150");

  async function save() {
    try {
      const center = { lat: Number(lat), lng: Number(lng) };
      const radiusM = Number(radius);
      const placeId = title.toLowerCase().replace(/\s+/g,"_");
      const res: any = await fn.setPlace({ placeId, type, title, center, radiusM });
      if (!res.data?.ok) throw new Error("Not saved");
      Alert.alert("OK", "Место сохранено");
    } catch (e: any) {
      Alert.alert("Ошибка", e.message ?? String(e));
    }
  }

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text>Название</Text>
      <TextInput value={title} onChangeText={setTitle} style={{borderWidth:1,padding:8}} />
      <Text>Тип: home / school / custom</Text>
      <TextInput value={type} onChangeText={(t)=>setType(t as any)} style={{borderWidth:1,padding:8}} />
      <Text>Широта / Долгота</Text>
      <TextInput value={lat} onChangeText={setLat} style={{borderWidth:1,padding:8}} />
      <TextInput value={lng} onChangeText={setLng} style={{borderWidth:1,padding:8}} />
      <Text>Радиус (м)</Text>
      <TextInput value={radius} onChangeText={setRadius} style={{borderWidth:1,padding:8}} />
      <Button title="Сохранить место" onPress={save} />
    </View>
  );
}

import React, { useEffect, useState } from "react";
import MapView, { Marker } from "react-native-maps";
import { View, Button } from "react-native";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { ensureLocationPermissions, startPinging, stopPinging } from "../services/locationService";

type Point = { uid: string; lat: number; lng: number; };

export default function FamilyMapScreen() {
  const [points, setPoints] = useState<Point[]>([]);

  async function load() {
    // простая выборка всех current (в прод — фильтруем по familyId)
    const col = collection(db, "locations", "current", "");
    const snap = await getDocs(col);
    const items: Point[] = [];
    snap.forEach(d => {
      const v = d.data() as any;
      items.push({ uid: d.id, lat: v.lat, lng: v.lng });
    });
    setPoints(items);
  }

  useEffect(() => { load(); }, []);

  async function goOnline() {
    await ensureLocationPermissions();
    startPinging(120000);
  }

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }}
        initialRegion={{ latitude: 42.8746, longitude: 74.5698, latitudeDelta: 0.2, longitudeDelta: 0.2 }}>
        {points.map(p => (
          <Marker key={p.uid} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.uid} />
        ))}
      </MapView>
      <View style={{ position: "absolute", bottom: 20, left: 20, right: 20 }}>
        <Button title="Обновить" onPress={load} />
        <View style={{ height: 8 }} />
        <Button title="Включить пинги" onPress={goOnline} />
        <View style={{ height: 8 }} />
        <Button title="Стоп" onPress={stopPinging} />
      </View>
    </View>
  );
}

// apps/mobile/src/screens/FamilyMapScreen.tsx
import React, { useEffect, useState } from "react";
import MapView, { Marker } from "react-native-maps";
import { View, Button } from "react-native";
import { db } from "../firebase";
import { collectionGroup, getDocs } from "firebase/firestore";
import {
  ensureLocationPermissions,
  startPinging,
  stopPinging,
} from "../services/locationService";

type Point = { uid: string; lat: number; lng: number };

export default function FamilyMapScreen() {
  const [points, setPoints] = useState<Point[]>([]);

  async function load() {
    try {
      // Читаем все geo/*/meta/last
      const snap = await getDocs(collectionGroup(db, "meta"));
      const items: Point[] = [];
      snap.forEach((d) => {
        if (d.id !== "last") return;
        const v = d.data() as any;
        if (typeof v.lat !== "number" || typeof v.lng !== "number") return;

        // путь вида geo/{uid}/meta/last
        const segments = d.ref.path.split("/");
        const uid = segments[1] || d.id;

        items.push({ uid, lat: v.lat, lng: v.lng });
      });
      setPoints(items);
    } catch (e) {
      console.log("load map points error", e);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function goOnline() {
    try {
      await ensureLocationPermissions();
      startPinging(120000); // каждые 2 минуты
    } catch (e) {
      console.log("goOnline error", e);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0b0f17" }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: 40.7128, // США по-умолчанию; потом подвинем по семье
          longitude: -74.006,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }}
      >
        {points.map((p) => (
          <Marker
            key={p.uid}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.uid}
          />
        ))}
      </MapView>
      <View
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          right: 20,
          backgroundColor: "#111827dd",
          padding: 12,
          borderRadius: 12,
        }}
      >
        <Button title="Обновить" onPress={load} />
        <View style={{ height: 8 }} />
        <Button title="Включить пинги" onPress={goOnline} />
        <View style={{ height: 8 }} />
        <Button title="Стоп" onPress={stopPinging} />
      </View>
    </View>
  );
}

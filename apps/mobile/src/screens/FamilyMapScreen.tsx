// apps/mobile/src/screens/FamilyMapScreen.tsx
import React, { useEffect, useState } from "react";
import MapView, { Marker } from "react-native-maps";
import { View, Button } from "react-native";
import {
  loadGeoPoints,
  getFamilyId,
  loadFamilyPlaces,
  GeoPoint,
  FamilyPlace,
} from "../lib/geo";
import {
  ensureLocationPermissions,
  startPinging,
  stopPinging,
} from "../services/locationService";

type Point = { uid: string; lat: number; lng: number };

export default function FamilyMapScreen() {
  const [points, setPoints] = useState<Point[]>([]);
  const [places, setPlaces] = useState<FamilyPlace[]>([]);
  const [fid, setFid] = useState<string | null>(null);

  // старая логика load() + новая реализация через loadGeoPoints()
  async function load() {
    try {
      const fp: GeoPoint[] = await loadGeoPoints();
      const items: Point[] = fp.map((p) => ({
        uid: p.uid,
        lat: p.lat,
        lng: p.lng,
      }));
      setPoints(items);
    } catch (e) {
      console.log("load map points error", e);
    }
  }

  async function loadAll() {
    try {
      const id = await getFamilyId();
      setFid(id);

      await load();

      if (id) {
        const p = await loadFamilyPlaces(id);
        setPlaces(p);
      } else {
        setPlaces([]);
      }
    } catch (e) {
      console.log("loadAll error", e);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function goOnline() {
    try {
      await ensureLocationPermissions();
      // каждые 2 минуты
      startPinging(120000);
    } catch (e) {
      console.log("goOnline error", e);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0b0f17" }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: 40.7128, // default US; позже можно центрировать по семье
          longitude: -74.006,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }}
      >
        {points.map((p) => (
          <Marker
            key={p.uid}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.uid.slice(0, 6)}
            pinColor="dodgerblue"
          />
        ))}

        {places.map((pl) => (
          <Marker
            key={pl.id}
            coordinate={{ latitude: pl.lat, longitude: pl.lng }}
            title={pl.name}
            pinColor="gold"
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
        <Button title="Refresh" onPress={loadAll} />
        <View style={{ height: 8 }} />
        <Button title="Enable GPS ping" onPress={goOnline} />
        <View style={{ height: 8 }} />
        <Button title="Stop" onPress={stopPinging} />
      </View>
    </View>
  );
}

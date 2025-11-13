// apps/mobile/src/screens/PlacesScreen.tsx
import React, { useState } from "react";
import { View, Text, TextInput, Button, Alert } from "react-native";
import { fn } from "../lib/functionsClient";

export default function PlacesScreen() {
  const [title, setTitle] = useState("Home");
  const [type, setType] = useState<"home" | "school" | "custom">("home");
  const [lat, setLat] = useState("42.8746");
  const [lng, setLng] = useState("74.5698");
  const [radius, setRadius] = useState("150");
  const [loading, setLoading] = useState(false);

  async function save() {
    try {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      const radiusM = Number(radius);

      if (!title.trim()) {
        throw new Error("Title is required");
      }
      if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
        throw new Error("Latitude and longitude must be valid numbers");
      }
      if (!radiusM || Number.isNaN(radiusM) || radiusM <= 0) {
        throw new Error("Radius must be a positive number");
      }

      // API expects [lat, lng] tuple
      const center: [number, number] = [latNum, lngNum];
      const placeId = title.toLowerCase().replace(/\s+/g, "_");

      setLoading(true);

      const call = fn<{
        placeId: string;
        type: string;
        title: string;
        center: [number, number];
        radiusM: number;
      }, { ok: boolean }>("setPlace");

      const res = await call({ placeId, type, title, center, radiusM });

      if (!res?.data?.ok) {
        throw new Error("Place was not saved");
      }

      Alert.alert("Saved", "Place saved successfully");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        padding: 16,
        gap: 12,
        flex: 1,
        backgroundColor: "#0b0c0f",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>
        Family Places
      </Text>
      <Text style={{ color: "#9ca3af" }}>
        Define safe zones like home, school, or custom places for your family.
      </Text>

      <Text style={{ color: "#e5e7eb", marginTop: 8 }}>Title</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Home"
        placeholderTextColor="#6b7280"
        style={{
          borderWidth: 1,
          borderColor: "#374151",
          padding: 8,
          borderRadius: 8,
          color: "#e5e7eb",
        }}
      />

      <Text style={{ color: "#e5e7eb", marginTop: 8 }}>
        Type: home / school / custom
      </Text>
      <TextInput
        value={type}
        onChangeText={(t) => setType(t as any)}
        placeholder="home"
        placeholderTextColor="#6b7280"
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: "#374151",
          padding: 8,
          borderRadius: 8,
          color: "#e5e7eb",
        }}
      />

      <Text style={{ color: "#e5e7eb", marginTop: 8 }}>Latitude / Longitude</Text>
      <TextInput
        value={lat}
        onChangeText={setLat}
        keyboardType="numeric"
        placeholder="Latitude"
        placeholderTextColor="#6b7280"
        style={{
          borderWidth: 1,
          borderColor: "#374151",
          padding: 8,
          borderRadius: 8,
          color: "#e5e7eb",
        }}
      />
      <TextInput
        value={lng}
        onChangeText={setLng}
        keyboardType="numeric"
        placeholder="Longitude"
        placeholderTextColor="#6b7280"
        style={{
          borderWidth: 1,
          borderColor: "#374151",
          padding: 8,
          borderRadius: 8,
          color: "#e5e7eb",
        }}
      />

      <Text style={{ color: "#e5e7eb", marginTop: 8 }}>Radius (meters)</Text>
      <TextInput
        value={radius}
        onChangeText={setRadius}
        keyboardType="numeric"
        placeholder="150"
        placeholderTextColor="#6b7280"
        style={{
          borderWidth: 1,
          borderColor: "#374151",
          padding: 8,
          borderRadius: 8,
          color: "#e5e7eb",
        }}
      />

      <View style={{ marginTop: 12 }}>
        <Button
          title={loading ? "Saving..." : "Save place"}
          onPress={save}
          disabled={loading}
        />
      </View>
    </View>
  );
}

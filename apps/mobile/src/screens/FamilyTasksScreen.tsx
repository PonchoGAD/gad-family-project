// apps/mobile/src/screens/FamilyTasksScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Button,
  Alert,
} from "react-native";
import { auth } from "../firebase";
import {
  listenFamilyTasks,
  createFamilyTask,
  toggleFamilyTask,
  getCurrentUserFamilyId,
} from "../lib/families";

type Task = {
  id: string;
  title: string;
  description?: string;
  createdBy: string;
  assignedTo?: string[];
  status: "open" | "done";
  createdAt?: any;
};

export default function FamilyTasksScreen() {
  const [fid, setFid] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<"all" | "mine" | "done">("all");

  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const user = auth.currentUser;

  useEffect(() => {
    (async () => {
      const id = await getCurrentUserFamilyId();
      setFid(id);

      if (!id) return;

      return listenFamilyTasks(id, (items) => {
        setTasks(items);
      });
    })();
  }, []);

  const filteredTasks = tasks.filter((t) => {
    if (filter === "mine") return t.createdBy === user?.uid;
    if (filter === "done") return t.status === "done";
    return true;
  });

  async function handleAdd() {
    if (!fid || !title.trim()) return;

    try {
      await createFamilyTask(fid, {
        title,
        description: desc,
        createdBy: user?.uid || "unknown",
        assignedTo: ["all"],
        status: "open",
      });

      setTitle("");
      setDesc("");
      setModalVisible(false);
    } catch (e: any) {
      console.log("create task error", e);
      Alert.alert("Error", e?.message ?? "Failed to create task");
    }
  }

  async function toggle(t: Task) {
    if (!fid) return;

    try {
      await toggleFamilyTask(fid, t.id, t.status === "open" ? "done" : "open");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to update task");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0b0f17", padding: 16 }}>
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
        Family Tasks
      </Text>

      {/* Filters */}
      <View style={{ flexDirection: "row", marginTop: 12, gap: 12 }}>
        {["all", "mine", "done"].map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f as any)}>
            <Text
              style={{
                color: filter === f ? "#60a5fa" : "#9ca3af",
                fontWeight: "600",
              }}
            >
              {f.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tasks list */}
      <FlatList
        style={{ marginTop: 16 }}
        data={filteredTasks}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => toggle(item)}
            style={{
              padding: 12,
              borderRadius: 10,
              backgroundColor: "#111827",
              marginBottom: 10,
            }}
          >
            <Text
              style={{
                color: item.status === "done" ? "#4ade80" : "#ffffff",
                fontWeight: "600",
              }}
            >
              {item.status === "done" ? "✔ " : "○ "}
              {item.title}
            </Text>
            {item.description ? (
              <Text style={{ color: "#9ca3af", marginTop: 4 }}>
                {item.description}
              </Text>
            ) : null}
            <Text style={{ color: "#6b7280", marginTop: 6, fontSize: 12 }}>
              by {item.createdBy.slice(0, 6)}…
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={{ color: "#6b7280", marginTop: 20 }}>
            No tasks yet
          </Text>
        }
      />

      {/* Add button */}
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        style={{
          position: "absolute",
          right: 20,
          bottom: 40,
          backgroundColor: "#60a5fa",
          paddingVertical: 14,
          paddingHorizontal: 24,
          borderRadius: 30,
        }}
      >
        <Text style={{ color: "#000", fontWeight: "700" }}>+ Add Task</Text>
      </TouchableOpacity>

      {/* Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "#111827",
              padding: 20,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, marginBottom: 12 }}>
              New Task
            </Text>

            <TextInput
              placeholder="Title"
              placeholderTextColor="#6b7280"
              value={title}
              onChangeText={setTitle}
              style={{
                backgroundColor: "#1f2937",
                color: "#fff",
                padding: 12,
                borderRadius: 8,
              }}
            />

            <TextInput
              placeholder="Description"
              placeholderTextColor="#6b7280"
              value={desc}
              onChangeText={setDesc}
              style={{
                backgroundColor: "#1f2937",
                color: "#fff",
                padding: 12,
                borderRadius: 8,
                marginTop: 12,
              }}
            />

            <View style={{ marginTop: 16 }}>
              <Button title="Add" onPress={handleAdd} />
            </View>
            <View style={{ marginTop: 6 }}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------
// apps/mobile/src/screens/FamilyTasksScreen.tsx
// Family Tasks (Demo-aware) / unified GAD theme / Firestore safe
// ---------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";

import { auth } from "../firebase";
import {
  listenFamilyTasks,
  createFamilyTask,
  toggleFamilyTask,
  getCurrentUserFamilyId,
} from "../lib/families";

import { useTheme } from "../wallet/ui/theme";
import {
  useActiveUid,
  useActiveFamilyId,
  useIsDemo,
} from "../demo/DemoContext";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type Task = {
  id: string;
  title: string;
  description?: string;
  createdBy: string;
  assignedTo?: string[];
  status: "open" | "done";
  createdAt?: any;
};

// ---------------------------------------------------------------
// Screen
// ---------------------------------------------------------------
export default function FamilyTasksScreen() {
  const G = useTheme();
  const isDemo = useIsDemo();
  const { uid: demoUid } = useActiveUid();
  const { fid: demoFid } = useActiveFamilyId();

  const userUid = demoUid ?? auth.currentUser?.uid ?? null;

  const [fid, setFid] = useState<string | null>(demoFid ?? null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<"all" | "mine" | "done">("all");

  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(true);

  // -------------------------------------------------------------
  // Load tasks & familyId (demo vs real)
  // -------------------------------------------------------------
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        // DEMO: полностью локальная витрина
        if (isDemo) {
          const demoFamilyId = demoFid ?? "demo-family";
          setFid(demoFamilyId);

          const now = Date.now();
          const demoTasks: Task[] = [
            {
              id: "demo-1",
              title: "Evening family walk",
              description: "Walk together for at least 30 minutes.",
              createdBy: "demo-parent-1",
              assignedTo: ["all"],
              status: "open",
              createdAt: { seconds: Math.floor((now - 3600 * 4 * 1000) / 1000) },
            },
            {
              id: "demo-2",
              title: "Homework check",
              description: "Check kids’ homework before 9 PM.",
              createdBy: "demo-parent-2",
              assignedTo: ["parents"],
              status: "done",
              createdAt: { seconds: Math.floor((now - 3600 * 24 * 1000) / 1000) },
            },
            {
              id: "demo-3",
              title: "Prepare school bag",
              description: "Kids prepare their backpack on their own.",
              createdBy: "demo-parent-1",
              assignedTo: ["kids"],
              status: "open",
              createdAt: { seconds: Math.floor((now - 3600 * 30 * 1000) / 1000) },
            },
          ];

          setTasks(demoTasks);
          setLoading(false);
          return;
        }

        // REAL: Firestore-подписка
        let realFid = demoFid ?? null;

        if (!realFid) {
          realFid = (await getCurrentUserFamilyId()) ?? null;
        }

        setFid(realFid);

        if (!realFid) {
          setLoading(false);
          return;
        }

        unsub = listenFamilyTasks(realFid, (items) => {
          setTasks(items);
          setLoading(false);
        });
      } catch (e) {
        console.log("FamilyTasks load error", e);
        setLoading(false);
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [demoFid, isDemo]);

  // -------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------
  const filteredTasks = tasks.filter((t) => {
    if (filter === "mine") return t.createdBy === userUid;
    if (filter === "done") return t.status === "done";
    return true;
  });

  // -------------------------------------------------------------
  // Add task
  // -------------------------------------------------------------
  async function handleAdd() {
    if (!fid) {
      Alert.alert("Tasks", "No family found.");
      return;
    }

    if (!title.trim()) {
      Alert.alert("Tasks", "Enter task title.");
      return;
    }

    try {
      const createdBy = userUid || "unknown";

      if (isDemo) {
        // DEMO: только локальное состояние
        const newTask: Task = {
          id: `demo-${Date.now()}`,
          title: title.trim(),
          description: desc.trim() || undefined,
          createdBy,
          assignedTo: ["all"],
          status: "open",
          createdAt: { seconds: Math.floor(Date.now() / 1000) },
        };

        setTasks((prev) => [newTask, ...prev]);
        setTitle("");
        setDesc("");
        setModalVisible(false);
        Alert.alert(
          "Tasks (demo)",
          "Task added locally. In production it will be stored for your family."
        );
        return;
      }

      // REAL: Firestore
      await createFamilyTask(fid, {
        title,
        description: desc,
        createdBy,
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

  // -------------------------------------------------------------
  // Toggle
  // -------------------------------------------------------------
  async function handleToggle(t: Task) {
    if (!fid) {
      Alert.alert("Tasks", "No family found");
      return;
    }

    try {
      const nextStatus = t.status === "open" ? "done" : "open";

      if (isDemo) {
        // DEMO: локальный toggle
        setTasks((prev) =>
          prev.map((x) =>
            x.id === t.id
              ? {
                  ...x,
                  status: nextStatus,
                }
              : x
          )
        );
        return;
      }

      // REAL: Firestore
      await toggleFamilyTask(fid, t.id, nextStatus);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to update task");
    }
  }

  // -------------------------------------------------------------
  // UI
  // -------------------------------------------------------------
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: G.colors.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={G.colors.accent} />
        <Text style={{ color: G.colors.textMuted, marginTop: 8 }}>
          Loading tasks…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: G.colors.bg, padding: 16 }}>
      <Text style={{ color: G.colors.text, fontSize: 22, fontWeight: "700" }}>
        Family Tasks{isDemo ? " (demo)" : ""}
      </Text>

      {/* Filters */}
      <View style={{ flexDirection: "row", marginTop: 12, gap: 12 }}>
        {["all", "mine", "done"].map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity key={f} onPress={() => setFilter(f as any)}>
              <Text
                style={{
                  color: active ? G.colors.accent : G.colors.textMuted,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* No family fallback */}
      {!fid && (
        <Text
          style={{
            color: G.colors.textMuted,
            marginTop: 20,
            fontSize: 13,
          }}
        >
          You are not part of a family yet.
        </Text>
      )}

      {/* Tasks list */}
      {fid && (
        <FlatList
          style={{ marginTop: 16 }}
          data={filteredTasks}
          keyExtractor={(i) => i.id}
          ListEmptyComponent={
            <Text style={{ color: G.colors.textMuted, marginTop: 20 }}>
              No tasks yet
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleToggle(item)}
              activeOpacity={0.85}
              style={{
                padding: 14,
                borderRadius: 14,
                marginBottom: 12,
                backgroundColor: G.colors.card,
                borderColor: G.colors.border,
                borderWidth: 1,
              }}
            >
              <Text
                style={{
                  color:
                    item.status === "done" ? G.colors.accent : G.colors.text,
                  fontWeight: "700",
                }}
              >
                {item.status === "done" ? "✔ " : "○ "}
                {item.title}
              </Text>

              {item.description ? (
                <Text
                  style={{
                    color: G.colors.textMuted,
                    marginTop: 4,
                    fontSize: 13,
                  }}
                >
                  {item.description}
                </Text>
              ) : null}

              <Text
                style={{
                  color: G.colors.textMuted,
                  marginTop: 6,
                  fontSize: 11,
                }}
              >
                by {item.createdBy.slice(0, 6)}…
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Add button */}
      {fid && (
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
          style={{
            position: "absolute",
            right: 20,
            bottom: 40,
            backgroundColor: G.colors.accent,
            paddingVertical: 14,
            paddingHorizontal: 26,
            borderRadius: 30,
          }}
        >
          <Text
            style={{
              color: G.colors.bg,
              fontWeight: "800",
              fontSize: 14,
            }}
          >
            + Add Task
          </Text>
        </TouchableOpacity>
      )}

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
              backgroundColor: G.colors.card,
              padding: 20,
              borderRadius: 16,
              borderColor: G.colors.border,
              borderWidth: 1,
            }}
          >
            <Text
              style={{ color: G.colors.text, fontSize: 18, marginBottom: 12 }}
            >
              New Task
            </Text>

            <TextInput
              placeholder="Title"
              placeholderTextColor={G.colors.textMuted}
              value={title}
              onChangeText={setTitle}
              style={{
                backgroundColor: G.colors.input,
                color: G.colors.text,
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: G.colors.border,
              }}
            />

            <TextInput
              placeholder="Description"
              placeholderTextColor={G.colors.textMuted}
              value={desc}
              onChangeText={setDesc}
              style={{
                backgroundColor: G.colors.input,
                color: G.colors.text,
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: G.colors.border,
                marginTop: 12,
              }}
            />

            <TouchableOpacity
              onPress={handleAdd}
              activeOpacity={0.85}
              style={{
                marginTop: 16,
                paddingVertical: 12,
                alignItems: "center",
                borderRadius: 999,
                backgroundColor: G.colors.accent,
              }}
            >
              <Text
                style={{ color: "#052e16", fontWeight: "700", fontSize: 14 }}
              >
                Add Task
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              activeOpacity={0.85}
              style={{
                marginTop: 10,
                paddingVertical: 12,
                alignItems: "center",
                borderRadius: 999,
                backgroundColor: G.colors.card,
                borderWidth: 1,
                borderColor: G.colors.border,
              }}
            >
              <Text style={{ color: G.colors.textMuted, fontWeight: "700" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// apps/mobile/src/types/tasks.ts

import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from "firebase/firestore";

/**
 * Family task type used in UI and Firestore.
 */
export type FamilyTask = {
  id: string;
  title: string;
  description?: string;
  createdBy: string;       // uid автора
  assignedTo?: string[];   // ["all"] или список uid
  status: "open" | "done";
  createdAt?: any;
};

/**
 * Firestore converter so we can use:
 *   query(...).withConverter(listenToFamilyTasksConverter)
 * и получать FamilyTask с id.
 */
export const listenToFamilyTasksConverter: FirestoreDataConverter<FamilyTask> = {
  toFirestore(task: FamilyTask) {
    // id хранить не нужно, он уже есть в документе
    const { id, ...rest } = task as any;
    return rest;
  },

  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): FamilyTask {
    const data = snapshot.data(options) as any;
    return {
      id: snapshot.id,
      title: data.title ?? "",
      description: data.description ?? "",
      createdBy: data.createdBy ?? "",
      assignedTo: data.assignedTo ?? [],
      status: (data.status as "open" | "done") ?? "open",
      createdAt: data.createdAt,
    };
  },
};

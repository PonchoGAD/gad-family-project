// apps/mobile/src/lib/chatMedia.ts

import { storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * Convert local file URI (Expo / React Native) to Blob.
 */
async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob;
}

function getChatMediaPath(
  chatId: string,
  messageId: string,
  kind: "original" | "thumb"
): string {
  return `chatMedia/${chatId}/${messageId}/${kind}`;
}

/**
 * Upload image for chat message.
 * For now thumbnailUrl = mediaUrl (TODO: real thumbnail generation).
 */
export async function uploadChatImage(
  chatId: string,
  messageId: string,
  localUri: string
): Promise<{ mediaUrl: string; thumbnailUrl?: string }> {
  const path = getChatMediaPath(chatId, messageId, "original");
  const storageRef = ref(storage, path);

  const blob = await uriToBlob(localUri);
  await uploadBytes(storageRef, blob);

  const mediaUrl = await getDownloadURL(storageRef);

  // TODO: generate real thumbnail (via Cloud Function or client-side)
  const thumbnailUrl = mediaUrl;

  return { mediaUrl, thumbnailUrl };
}

/**
 * Upload generic file (pdf, doc, zip, etc).
 */
export async function uploadChatFile(
  chatId: string,
  messageId: string,
  localUri: string,
  mimeType: string
): Promise<string> {
  const path = getChatMediaPath(chatId, messageId, "original");
  const storageRef = ref(storage, path);

  const blob = await uriToBlob(localUri);
  await uploadBytes(storageRef, blob, { contentType: mimeType });

  const mediaUrl = await getDownloadURL(storageRef);
  return mediaUrl;
}

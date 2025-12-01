// apps/mobile/src/lib/chatTypes.ts

// Generic timestamp-like type so we can reuse these types
// in both mobile app and Cloud Functions without importing Firebase types.
export type TimestampLike = any;

export type ChatType = "family" | "dm" | "group" | "assistant" | "interfamily";

export type MessageType =
  | "text"
  | "image"
  | "file"
  | "voice"
  | "system"
  | "call";

export type Chat = {
  id: string;
  type: ChatType;

  // For family / group chats
  familyId?: string;

  // All participants (user uids)
  memberIds: string[];

  // Group/assistant title/label
  title?: string;

  createdAt: TimestampLike;
  createdBy: string;

  lastMessagePreview?: string;
  lastMessageAt?: TimestampLike;
  lastMessageSenderId?: string;

  isArchived?: boolean;

  // Basic privacy / safety toggles
  allowMedia: boolean;
  allowExternalLinks: boolean;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  type: MessageType;

  text?: string;

  mediaUrl?: string;
  mediaType?: string; // 'image/jpeg', 'application/pdf', 'audio/m4a', ...
  mediaSize?: number;
  thumbnailUrl?: string;

  replyToId?: string; // message id we reply to

  createdAt: TimestampLike;
  editedAt?: TimestampLike;

  // Per-user hide
  deletedFor?: string[];
  // Global delete
  deletedForEveryone?: boolean;

  reactions?: {
    [emoji: string]: string[]; // emoji -> list of uids
  };

  deliveredTo?: string[]; // uids that received
  readBy?: string[]; // uids that read

  systemPayload?: any; // for system / call messages
};

export type UserChatMeta = {
  chatId: string;
  uid: string;

  lastReadAt?: TimestampLike;
  lastReadMessageId?: string;

  isMuted?: boolean;
  isPinned?: boolean;
  notificationsEnabled?: boolean;
};

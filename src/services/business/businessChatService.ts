/**
 * Business team chat — mirrors mobile `businessChat.ts`.
 * Firestore: organizations/{orgId}/chats/{chatId}/messages|reads
 */
import { ensureOrgMemberForOwner } from "@/lib/organizations";
import {
  getAuthInstance,
  getFirestoreInstance,
  getStorageInstance,
  ref,
  uploadBytes,
  getDownloadURL,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
} from "@/lib/firebase";

export type BusinessChatType = "general";
export type BusinessChatMessageType = "text" | "image";

export type BusinessChatDoc = {
  id: string;
  orgId: string;
  type: BusinessChatType;
  title: string;
  createdAt: unknown;
  updatedAt: unknown;
  lastMessageText: string;
  lastMessageAt: unknown;
  lastMessageByUid: string | null;
};

export type BusinessChatMessageDoc = {
  id: string;
  orgId: string;
  chatId: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  text: string;
  type: BusinessChatMessageType;
  imageUrl?: string;
  storagePath?: string;
  createdAt: unknown;
  updatedAt?: unknown;
  deletedAt?: unknown;
  status: "sent";
};

const MAX_CHAT_IMAGE_BYTES = 15 * 1024 * 1024;

function requireUid(): string {
  const uid = getAuthInstance()?.currentUser?.uid ?? null;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

function toChatDoc(id: string, raw: Record<string, unknown>): BusinessChatDoc {
  return {
    id,
    orgId: typeof raw.orgId === "string" ? raw.orgId : "",
    type: raw.type === "general" ? "general" : "general",
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "General",
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    lastMessageText: typeof raw.lastMessageText === "string" ? raw.lastMessageText : "",
    lastMessageAt: raw.lastMessageAt ?? null,
    lastMessageByUid: typeof raw.lastMessageByUid === "string" ? raw.lastMessageByUid : null,
  };
}

function toMessageDoc(id: string, raw: Record<string, unknown>): BusinessChatMessageDoc {
  const messageType: BusinessChatMessageType = raw.type === "image" ? "image" : "text";
  return {
    id,
    orgId: typeof raw.orgId === "string" ? raw.orgId : "",
    chatId: typeof raw.chatId === "string" ? raw.chatId : "",
    senderUid: typeof raw.senderUid === "string" ? raw.senderUid : "",
    senderName: typeof raw.senderName === "string" ? raw.senderName : "",
    senderEmail: typeof raw.senderEmail === "string" ? raw.senderEmail : "",
    text: typeof raw.text === "string" ? raw.text : "",
    type: messageType,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
    storagePath: typeof raw.storagePath === "string" ? raw.storagePath : undefined,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? undefined,
    deletedAt: raw.deletedAt ?? undefined,
    status: "sent",
  };
}

export async function ensureGeneralChat(orgId: string): Promise<void> {
  requireUid();
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const normalizedOrgId = orgId.trim();
  if (!normalizedOrgId) return;

  const uid = requireUid();
  await ensureOrgMemberForOwner(normalizedOrgId, uid);

  const chatRef = doc(db, `organizations/${normalizedOrgId}/chats/general`);
  const snap = await getDoc(chatRef);
  if (snap.exists()) return;

  await setDoc(chatRef, {
    orgId: normalizedOrgId,
    type: "general",
    title: "General",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessageText: "",
    lastMessageAt: serverTimestamp(),
    lastMessageByUid: null,
  });
}

export function listenBusinessChats(
  orgId: string,
  callback: (chats: BusinessChatDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  return listenGeneralBusinessChat(
    orgId,
    (chat) => callback(chat ? [chat] : []),
    onError
  );
}

export function listenGeneralBusinessChat(
  orgId: string,
  callback: (chat: BusinessChatDoc | null) => void,
  onError?: (error: Error) => void
): () => void {
  const db = getFirestoreInstance();
  if (!db) {
    onError?.(new Error("Firestore not configured"));
    return () => {};
  }

  const normalizedOrgId = orgId.trim();
  const chatRef = doc(db, `organizations/${normalizedOrgId}/chats/general`);
  return onSnapshot(
    chatRef,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(toChatDoc(snap.id, snap.data() as Record<string, unknown>));
    },
    (err) => onError?.(err)
  );
}

export function listenChatMessages(
  orgId: string,
  chatId: string,
  callback: (messages: BusinessChatMessageDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  const db = getFirestoreInstance();
  if (!db) {
    onError?.(new Error("Firestore not configured"));
    return () => {};
  }

  const messagesRef = collection(db, `organizations/${orgId}/chats/${chatId}/messages`);
  const q = query(messagesRef, orderBy("createdAt", "asc"), limit(250));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) =>
        toMessageDoc(d.id, d.data() as Record<string, unknown>)
      );
      callback(rows);
    },
    (err) => onError?.(err)
  );
}

export async function sendTextMessage(input: {
  orgId: string;
  chatId: string;
  text: string;
}): Promise<void> {
  const uid = requireUid();
  const authUser = getAuthInstance()?.currentUser ?? null;
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const text = input.text.trim();
  if (!text) return;

  await ensureGeneralChat(input.orgId);

  const messagesRef = collection(db, `organizations/${input.orgId}/chats/${input.chatId}/messages`);
  await addDoc(messagesRef, {
    orgId: input.orgId,
    chatId: input.chatId,
    senderUid: uid,
    senderName: authUser?.displayName ?? authUser?.email ?? uid,
    senderEmail: authUser?.email ?? "",
    text,
    type: "text",
    createdAt: serverTimestamp(),
    status: "sent",
  });

  const chatRef = doc(db, `organizations/${input.orgId}/chats/${input.chatId}`);
  await updateDoc(chatRef, {
    updatedAt: serverTimestamp(),
    lastMessageText: text,
    lastMessageAt: serverTimestamp(),
    lastMessageByUid: uid,
  });
}

export async function sendImageMessage(input: {
  orgId: string;
  chatId: string;
  file: File;
  mimeType?: string;
}): Promise<void> {
  const uid = requireUid();
  const authUser = getAuthInstance()?.currentUser ?? null;
  const db = getFirestoreInstance();
  const storage = getStorageInstance();
  if (!db) throw new Error("Firestore not configured");
  if (!storage) throw new Error("Storage not configured");

  const mimeType = input.mimeType?.trim() || input.file.type || "image/jpeg";
  if (input.file.size > MAX_CHAT_IMAGE_BYTES) {
    throw new Error("Image is too large (max 15 MB).");
  }

  await ensureGeneralChat(input.orgId);

  const ext = mimeType.includes("png") ? "png" : "jpg";
  const fileName = `${uid}_${Date.now()}.${ext}`;
  const storagePath = `organizations/${input.orgId}/chats/${input.chatId}/messages/${fileName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, input.file, { contentType: mimeType });
  const imageUrl = await getDownloadURL(storageRef);

  const messagesRef = collection(db, `organizations/${input.orgId}/chats/${input.chatId}/messages`);
  await addDoc(messagesRef, {
    orgId: input.orgId,
    chatId: input.chatId,
    senderUid: uid,
    senderName: authUser?.displayName ?? authUser?.email ?? uid,
    senderEmail: authUser?.email ?? "",
    text: "",
    type: "image",
    imageUrl,
    storagePath,
    createdAt: serverTimestamp(),
    status: "sent",
  });

  const chatRef = doc(db, `organizations/${input.orgId}/chats/${input.chatId}`);
  await updateDoc(chatRef, {
    updatedAt: serverTimestamp(),
    lastMessageText: "📷",
    lastMessageAt: serverTimestamp(),
    lastMessageByUid: uid,
  });
}

export async function markChatRead(input: { orgId: string; chatId: string }): Promise<void> {
  const uid = requireUid();
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const readRef = doc(db, `organizations/${input.orgId}/chats/${input.chatId}/reads/${uid}`);
  await setDoc(
    readRef,
    {
      uid,
      lastReadAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function toMillis(raw: unknown): number {
  if (!raw) return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof raw === "object" && raw !== null) {
    const maybe = raw as { toDate?: () => Date };
    if (typeof maybe.toDate === "function") {
      const parsed = maybe.toDate().getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  return 0;
}

export async function getUnreadChatCount(orgId: string, uid: string): Promise<number> {
  if (!orgId || !uid) return 0;
  const db = getFirestoreInstance();
  if (!db) return 0;

  const normalizedOrgId = orgId.trim();
  if (!normalizedOrgId) return 0;

  const chatRef = doc(db, `organizations/${normalizedOrgId}/chats/general`);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) return 0;

  const readRef = doc(db, `organizations/${normalizedOrgId}/chats/general/reads/${uid}`);
  const readSnap = await getDoc(readRef);
  const lastReadAtMs = toMillis(readSnap.data()?.lastReadAt);

  const messagesRef = collection(db, `organizations/${normalizedOrgId}/chats/general/messages`);
  const q =
    lastReadAtMs > 0
      ? query(messagesRef, where("createdAt", ">", new Date(lastReadAtMs)), orderBy("createdAt", "desc"), limit(100))
      : query(messagesRef, orderBy("createdAt", "desc"), limit(60));
  const snap = await getDocs(q);

  let unread = 0;
  for (const d of snap.docs) {
    const row = d.data() as Record<string, unknown>;
    if (row.deletedAt) continue;
    if (typeof row.senderUid === "string" && row.senderUid === uid) continue;
    unread += 1;
    if (unread >= 99) break;
  }
  return unread;
}

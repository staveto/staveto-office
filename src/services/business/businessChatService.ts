/**
 * Business team chat — mirrors mobile `businessChat.ts`.
 * Firestore: organizations/{orgId}/chats/{chatId}/messages|reads
 */
import { ensureOrgMemberForOwner } from "@/lib/organizations";
import { ensureAuthTokenReady } from "@/lib/firebase";
import {
  buildDirectChatId,
  sortedParticipantUids,
  toMillis,
} from "@/services/business/businessChatUtils";
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

export type BusinessChatType = "general" | "direct";
export type BusinessChatMessageType = "text" | "image";

export type BusinessChatDoc = {
  id: string;
  orgId: string;
  type: BusinessChatType;
  title: string;
  participantUids?: string[];
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

export async function ensureMyOrgMemberIndex(orgId: string): Promise<void> {
  const normalizedOrgId = orgId.trim();
  if (!normalizedOrgId) return;

  await ensureAuthTokenReady();
  const { getCallable } = await import("@/lib/firebase");

  try {
    const listOrgs = getCallable<
      { orgId?: string },
      { organizations: { orgId: string }[] }
    >("listMyBusinessOrganizations");
    await listOrgs({ orgId: normalizedOrgId });
    return;
  } catch {
    /* Fall through to dedicated heal callable when deployed. */
  }

  try {
    const heal = getCallable<{ orgId: string }, { ok: boolean; healed: boolean }>(
      "ensureMyOrgMemberIndex"
    );
    await heal({ orgId: normalizedOrgId });
  } catch {
    /* Rules may still pass when members/{uid} already exists. */
  }
}

function requireUid(): string {
  const uid = getAuthInstance()?.currentUser?.uid ?? null;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

function toChatDoc(id: string, raw: Record<string, unknown>): BusinessChatDoc {
  const chatType: BusinessChatType = raw.type === "direct" ? "direct" : "general";
  const participantUids = Array.isArray(raw.participantUids)
    ? raw.participantUids.filter((u): u is string => typeof u === "string")
    : undefined;

  return {
    id,
    orgId: typeof raw.orgId === "string" ? raw.orgId : "",
    type: chatType,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "General",
    participantUids,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    lastMessageText: typeof raw.lastMessageText === "string" ? raw.lastMessageText : "",
    lastMessageAt: raw.lastMessageAt ?? null,
    lastMessageByUid: typeof raw.lastMessageByUid === "string" ? raw.lastMessageByUid : null,
  };
}

export function getOtherParticipantUid(
  chat: Pick<BusinessChatDoc, "type" | "participantUids">,
  currentUid: string
): string | null {
  if (chat.type !== "direct" || !chat.participantUids?.length) return null;
  return chat.participantUids.find((u) => u !== currentUid) ?? null;
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

export async function ensureDirectChat(input: {
  orgId: string;
  otherUid: string;
  otherDisplayName: string;
}): Promise<BusinessChatDoc> {
  const uid = requireUid();
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const normalizedOrgId = input.orgId.trim();
  const otherUid = input.otherUid.trim();
  if (!normalizedOrgId || !otherUid) throw new Error("Invalid chat participants");
  if (otherUid === uid) throw new Error("Cannot start a chat with yourself");

  await ensureMyOrgMemberIndex(normalizedOrgId);
  await ensureOrgMemberForOwner(normalizedOrgId, uid);

  const chatId = buildDirectChatId(uid, otherUid);
  const chatRef = doc(db, `organizations/${normalizedOrgId}/chats/${chatId}`);
  const snap = await getDoc(chatRef);
  if (snap.exists()) {
    return toChatDoc(snap.id, snap.data() as Record<string, unknown>);
  }

  const participantUids = sortedParticipantUids(uid, otherUid);
  const title = input.otherDisplayName.trim() || otherUid;

  await setDoc(chatRef, {
    orgId: normalizedOrgId,
    type: "direct",
    participantUids,
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessageText: "",
    lastMessageAt: serverTimestamp(),
    lastMessageByUid: null,
  });

  const created = await getDoc(chatRef);
  return toChatDoc(
    chatId,
    (created.data() ?? {
      orgId: normalizedOrgId,
      type: "direct",
      participantUids,
      title,
    }) as Record<string, unknown>
  );
}

async function ensureChatExists(orgId: string, chatId: string): Promise<void> {
  if (chatId === "general") {
    await ensureGeneralChat(orgId);
    return;
  }
  if (!chatId.startsWith("direct_")) return;
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const snap = await getDoc(doc(db, `organizations/${orgId}/chats/${chatId}`));
  if (!snap.exists()) throw new Error("Chat not found");
}

export async function ensureGeneralChat(orgId: string): Promise<void> {
  requireUid();
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const normalizedOrgId = orgId.trim();
  if (!normalizedOrgId) return;

  const uid = requireUid();
  await ensureMyOrgMemberIndex(normalizedOrgId);
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
  uid: string,
  callback: (chats: BusinessChatDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  const db = getFirestoreInstance();
  if (!db) {
    onError?.(new Error("Firestore not configured"));
    return () => {};
  }

  const normalizedOrgId = orgId.trim();
  let generalChat: BusinessChatDoc | null = null;
  let directChats: BusinessChatDoc[] = [];

  const emit = () => {
    const rows = [
      ...(generalChat ? [generalChat] : []),
      ...directChats,
    ].sort((a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt));
    callback(rows);
  };

  // Single-doc listener for general (same as mobile — avoids collection permission edge cases).
  const unsubGeneral = listenGeneralBusinessChat(
    normalizedOrgId,
    (chat) => {
      generalChat = chat;
      emit();
    },
    onError
  );

  // Only direct chats where the user is a participant (safe query — no leaked DMs).
  const directQ = query(
    collection(db, `organizations/${normalizedOrgId}/chats`),
    where("participantUids", "array-contains", uid)
  );
  const unsubDirect = onSnapshot(
    directQ,
    (snap) => {
      directChats = snap.docs
        .map((d) => toChatDoc(d.id, d.data() as Record<string, unknown>))
        .filter((chat) => chat.type === "direct");
      emit();
    },
    () => {
      directChats = [];
      emit();
    }
  );

  return () => {
    unsubGeneral();
    unsubDirect();
  };
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

  await ensureChatExists(input.orgId, input.chatId);

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

  await ensureChatExists(input.orgId, input.chatId);

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

export async function getUnreadCountForChat(
  orgId: string,
  uid: string,
  chatId: string
): Promise<number> {
  if (!orgId || !uid || !chatId) return 0;
  const db = getFirestoreInstance();
  if (!db) return 0;

  const normalizedOrgId = orgId.trim();
  if (!normalizedOrgId) return 0;

  const chatRef = doc(db, `organizations/${normalizedOrgId}/chats/${chatId}`);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) return 0;

  const readRef = doc(db, `organizations/${normalizedOrgId}/chats/${chatId}/reads/${uid}`);
  const readSnap = await getDoc(readRef);
  const lastReadAtMs = toMillis(readSnap.data()?.lastReadAt);

  const messagesRef = collection(db, `organizations/${normalizedOrgId}/chats/${chatId}/messages`);
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

/** Total unread across general + all direct chats for the signed-in user. */
export async function getUnreadChatCount(orgId: string, uid: string): Promise<number> {
  if (!orgId || !uid) return 0;
  const db = getFirestoreInstance();
  if (!db) return 0;

  const normalizedOrgId = orgId.trim();
  if (!normalizedOrgId) return 0;

  const chatIds = new Set<string>(["general"]);

  try {
    const directQ = query(
      collection(db, `organizations/${normalizedOrgId}/chats`),
      where("participantUids", "array-contains", uid)
    );
    const directSnap = await getDocs(directQ);
    for (const d of directSnap.docs) {
      if (d.id !== "general") chatIds.add(d.id);
    }
  } catch {
    /* Direct chat list is best-effort for the badge. */
  }

  let total = 0;
  for (const chatId of chatIds) {
    total += await getUnreadCountForChat(normalizedOrgId, uid, chatId);
    if (total >= 99) return 99;
  }
  return total;
}

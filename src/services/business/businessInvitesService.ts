import {
  getCallable,
  getFirestoreInstance,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "@/lib/firebase";

export type BusinessInviteRole = "manager" | "worker" | "viewer";

export type CreateBusinessInviteCodeInput = {
  orgId: string;
  role: BusinessInviteRole;
  emailLower?: string;
  requiresApproval?: boolean;
  expiresInHours?: number;
  maxUses?: number;
  platform?: "web" | "mobile";
};

export type CreateBusinessInviteCodeResult = {
  inviteId: string;
  code: string;
  deepLink?: string;
  webJoinUrl?: string;
  expiresAt?: string | null;
  maxUses?: number;
  requiresApproval?: boolean;
};

export type RedeemBusinessInviteCodeResult = {
  status: "active" | "pending";
  orgId: string;
  role: BusinessInviteRole | string;
  membershipId: string;
  requiresApproval?: boolean;
  alreadyMember?: boolean;
};

export type BusinessInviteListItem = {
  inviteId: string;
  codePrefix: string | null;
  role: BusinessInviteRole | string;
  status: string;
  type: string;
  emailLower: string | null;
  requiresApproval: boolean;
  expiresAt: string | null;
  usedCount: number;
  maxUses: number;
  code: string | null;
  deepLink: string | null;
};

export function buildWebJoinUrl(code: string): string {
  const encoded = encodeURIComponent(code);
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/join?code=${encoded}`;
  }
  return `/join?code=${encoded}`;
}

/** Legacy root `invites/` documents use long hex token in `/join?token=`. */
export function buildLegacyTokenJoinUrl(token: string): string {
  const encoded = encodeURIComponent(token.trim());
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/join?token=${encoded}`;
  }
  return `/join?token=${encoded}`;
}

function resolveWebJoinUrl(result: CreateBusinessInviteCodeResult): string {
  if (result.webJoinUrl) return result.webJoinUrl;
  return buildWebJoinUrl(result.code);
}

function parseCreateResult(raw: unknown): CreateBusinessInviteCodeResult {
  const data = (raw ?? {}) as Partial<CreateBusinessInviteCodeResult>;
  if (typeof data.inviteId !== "string" || typeof data.code !== "string") {
    throw new Error("Invalid createBusinessInviteCode response.");
  }
  const result: CreateBusinessInviteCodeResult = {
    inviteId: data.inviteId,
    code: data.code,
    deepLink: typeof data.deepLink === "string" ? data.deepLink : undefined,
    webJoinUrl: typeof data.webJoinUrl === "string" ? data.webJoinUrl : undefined,
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : data.expiresAt ?? null,
    maxUses: typeof data.maxUses === "number" ? data.maxUses : undefined,
    requiresApproval: data.requiresApproval === true,
  };
  result.webJoinUrl = resolveWebJoinUrl(result);
  return result;
}

function parseRedeemResult(raw: unknown): RedeemBusinessInviteCodeResult {
  const data = (raw ?? {}) as Partial<RedeemBusinessInviteCodeResult>;
  if (
    typeof data.status !== "string" ||
    typeof data.orgId !== "string" ||
    typeof data.membershipId !== "string"
  ) {
    throw new Error("Invalid redeemBusinessInviteCode response.");
  }
  return {
    status: data.status as "active" | "pending",
    orgId: data.orgId,
    role: data.role ?? "viewer",
    membershipId: data.membershipId,
    requiresApproval: data.requiresApproval === true,
    alreadyMember: data.alreadyMember === true,
  };
}

export type CachedBusinessInvitePayload = CreateBusinessInviteCodeResult & {
  role?: BusinessInviteRole | string;
  emailLower?: string | null;
  type?: string;
};

function timestampToIso(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Timestamp) return raw.toDate().toISOString();
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "object" && raw !== null && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function resolveDocEmailLower(data: Record<string, unknown>): string | null {
  const fromLower = typeof data.emailLower === "string" ? data.emailLower.trim().toLowerCase() : "";
  if (fromLower) return fromLower;
  const fromEmail = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  return fromEmail || null;
}

function mapFirestoreInviteDoc(
  inviteId: string,
  data: Record<string, unknown>
): BusinessInviteListItem {
  const role = typeof data.role === "string" ? data.role : "viewer";
  const type = typeof data.type === "string" ? data.type : "join_code";
  const usedCount =
    typeof data.usedCount === "number" && Number.isFinite(data.usedCount)
      ? Math.max(0, Math.floor(data.usedCount))
      : 0;
  const maxUses =
    typeof data.maxUses === "number" && Number.isFinite(data.maxUses)
      ? Math.max(1, Math.floor(data.maxUses))
      : 1;

  return {
    inviteId,
    codePrefix: typeof data.codePrefix === "string" ? data.codePrefix : null,
    role,
    status: typeof data.status === "string" ? data.status : "active",
    type,
    emailLower: resolveDocEmailLower(data),
    requiresApproval: data.requiresApproval === true,
    expiresAt: timestampToIso(data.expiresAt),
    usedCount,
    maxUses,
    code: null,
    deepLink: null,
  };
}

function parseListResult(raw: unknown): BusinessInviteListItem[] {
  const data = (raw ?? {}) as { invites?: unknown };
  if (!Array.isArray(data.invites)) return [];
  return data.invites as BusinessInviteListItem[];
}

async function listBusinessInvitesFromFirestore(orgId: string): Promise<BusinessInviteListItem[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const q = query(
    collection(db, "organizations", orgId, "invites"),
    where("status", "==", "active")
  );
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) =>
    mapFirestoreInviteDoc(docSnap.id, (docSnap.data() ?? {}) as Record<string, unknown>)
  );
}

function parseCachedInvitePayload(raw: unknown): CachedBusinessInvitePayload | null {
  try {
    const data = (raw ?? {}) as CachedBusinessInvitePayload;
    if (typeof data.inviteId !== "string" || typeof data.code !== "string") return null;
    return {
      ...parseCreateResult(data),
      role: data.role,
      emailLower: data.emailLower ?? null,
      type: data.type,
    };
  } catch {
    return null;
  }
}

export function listCachedBusinessInvites(orgId: string): BusinessInviteListItem[] {
  if (typeof window === "undefined") return [];
  const prefix = `${INVITE_CODE_CACHE_PREFIX}${orgId}.`;
  const seen = new Set<string>();
  const items: BusinessInviteListItem[] = [];

  const collectFromStorage = (storage: Storage) => {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key?.startsWith(prefix) || seen.has(key)) continue;
      seen.add(key);
      try {
        const payload = parseCachedInvitePayload(JSON.parse(storage.getItem(key)!));
        if (!payload) continue;
        items.push({
          inviteId: payload.inviteId,
          code: payload.code,
          codePrefix: payload.code.slice(0, 4),
          role: payload.role ?? "worker",
          status: "active",
          type: payload.type ?? (payload.emailLower ? "direct_email" : "join_code"),
          emailLower: payload.emailLower ?? null,
          requiresApproval: payload.requiresApproval === true,
          expiresAt: payload.expiresAt ?? null,
          usedCount: 0,
          maxUses: payload.maxUses ?? 1,
          deepLink: payload.deepLink ?? null,
        });
      } catch {
        /* ignore corrupt cache */
      }
    }
  };

  collectFromStorage(sessionStorage);
  collectFromStorage(localStorage);
  return items;
}

export function mergeBusinessInvitesWithCache(
  orgId: string,
  serverItems: BusinessInviteListItem[]
): BusinessInviteListItem[] {
  const byId = new Map(serverItems.map((item) => [item.inviteId, { ...item }]));
  for (const cached of listCachedBusinessInvites(orgId)) {
    const existing = byId.get(cached.inviteId);
    if (existing) {
      byId.set(cached.inviteId, {
        ...existing,
        code: existing.code ?? cached.code,
        emailLower: existing.emailLower ?? cached.emailLower,
        role: existing.role ?? cached.role,
        codePrefix: existing.codePrefix ?? cached.codePrefix,
        expiresAt: existing.expiresAt ?? cached.expiresAt,
        maxUses: existing.maxUses ?? cached.maxUses,
        type: existing.type || cached.type,
      });
    } else {
      byId.set(cached.inviteId, cached);
    }
  }
  return Array.from(byId.values()).map((item) => ({
    ...item,
    emailLower: resolveInviteEmailLower(orgId, item),
  }));
}

function mergeServerInviteSources(
  cfItems: BusinessInviteListItem[],
  firestoreItems: BusinessInviteListItem[]
): BusinessInviteListItem[] {
  const byId = new Map<string, BusinessInviteListItem>();
  for (const item of cfItems) {
    byId.set(item.inviteId, { ...item });
  }
  for (const fsItem of firestoreItems) {
    const existing = byId.get(fsItem.inviteId);
    if (existing) {
      byId.set(fsItem.inviteId, {
        ...existing,
        emailLower: existing.emailLower ?? fsItem.emailLower,
        code: existing.code ?? fsItem.code,
        codePrefix: existing.codePrefix ?? fsItem.codePrefix,
        role: existing.role || fsItem.role,
        type: existing.type || fsItem.type,
        status: existing.status || fsItem.status,
        expiresAt: existing.expiresAt ?? fsItem.expiresAt,
        usedCount: existing.usedCount ?? fsItem.usedCount,
        maxUses: existing.maxUses ?? fsItem.maxUses,
        requiresApproval: existing.requiresApproval || fsItem.requiresApproval,
        deepLink: existing.deepLink ?? fsItem.deepLink,
      });
    } else {
      byId.set(fsItem.inviteId, fsItem);
    }
  }
  return Array.from(byId.values());
}

export function createdInviteToListItem(
  created: CreateBusinessInviteCodeResult,
  meta: { role: BusinessInviteRole | string; emailLower?: string | null }
): BusinessInviteListItem {
  return {
    inviteId: created.inviteId,
    code: created.code,
    codePrefix: created.code.slice(0, 4),
    role: meta.role,
    status: "active",
    type: meta.emailLower ? "direct_email" : "join_code",
    emailLower: meta.emailLower ?? null,
    requiresApproval: created.requiresApproval === true,
    expiresAt: created.expiresAt ?? null,
    usedCount: 0,
    maxUses: created.maxUses ?? 1,
    deepLink: created.deepLink ?? null,
  };
}

/** Callable list with Firestore fallback and session cache merge. */
export async function fetchBusinessInvites(orgId: string): Promise<BusinessInviteListItem[]> {
  let cfItems: BusinessInviteListItem[] = [];
  try {
    cfItems = await listBusinessInvites(orgId);
  } catch {
    cfItems = [];
  }

  let firestoreItems: BusinessInviteListItem[] = [];
  try {
    firestoreItems = await listBusinessInvitesFromFirestore(orgId);
  } catch {
    firestoreItems = [];
  }

  const serverItems =
    cfItems.length > 0 || firestoreItems.length > 0
      ? mergeServerInviteSources(cfItems, firestoreItems)
      : [];

  return mergeBusinessInvitesWithCache(orgId, serverItems);
}

export function formatBusinessInviteError(error: unknown): string {
  const err = error as { code?: string; message?: string };
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  const msgLower = msg.toLowerCase();

  if (msgLower.includes("organization not found")) {
    return "members.invites.error.orgNotFound";
  }
  if (code === "functions/permission-denied" || msgLower.includes("permission-denied")) {
    return "members.invites.error.permissionDenied";
  }
  if (
    code === "functions/failed-precondition" &&
    (msgLower.includes("seat") || msgLower.includes("exceeds"))
  ) {
    return "members.invites.error.seatsExceeded";
  }
  if (code === "functions/not-found" || msgLower.includes("invalid")) {
    return "members.invites.error.invalidCode";
  }
  if (code === "functions/unauthenticated") {
    return "members.invites.error.notSignedIn";
  }
  if (
    code === "functions/failed-precondition" &&
    (msgLower.includes("not available") || msgLower.includes("regenerate"))
  ) {
    return "members.invites.error.codeUnavailable";
  }
  if (code === "functions/internal" || code === "functions/unavailable") {
    return "members.invites.error.loadCodeFailed";
  }
  return "members.invites.error.generic";
}

function normalizeInviteRoleForCreate(role: string): BusinessInviteRole {
  if (role === "manager" || role === "worker" || role === "viewer") return role;
  if (role === "admin") return "manager";
  return "worker";
}

/** Regenerate invite code — server decrypt/regenerate, or revoke + recreate as fallback. */
export async function regenerateBusinessInviteCode(
  orgId: string,
  invite: BusinessInviteListItem,
  emailLower?: string | null
): Promise<CreateBusinessInviteCodeResult> {
  try {
    return await fetchBusinessInviteDisplay(orgId, invite.inviteId, { regenerate: true });
  } catch (primaryError) {
    const err = primaryError as { code?: string; message?: string };
    const code = String(err?.code ?? "");
    const msgLower = String(err?.message ?? "").toLowerCase();
    const canFallback =
      code === "functions/not-found" ||
      code === "functions/failed-precondition" ||
      code === "functions/internal" ||
      code === "functions/unavailable" ||
      msgLower.includes("not available") ||
      msgLower.includes("regenerate");

    if (!canFallback) throw primaryError;
  }

  const email = (emailLower ?? invite.emailLower)?.trim().toLowerCase() || undefined;
  const role = normalizeInviteRoleForCreate(String(invite.role));

  await revokeBusinessInvite(orgId, invite.inviteId);
  const created = await createBusinessInviteCode({
    orgId,
    role,
    emailLower: email,
    maxUses: invite.maxUses,
    requiresApproval: invite.requiresApproval,
  });
  cacheBusinessInviteCode(orgId, created, {
    role,
    emailLower: email ?? null,
    type: email ? "direct_email" : "join_code",
  });
  if (email) {
    cacheBusinessInviteEmail(orgId, created.inviteId, email);
  }
  return created;
}

export async function createBusinessInviteCode(
  input: CreateBusinessInviteCodeInput
): Promise<CreateBusinessInviteCodeResult> {
  const callable = getCallable<CreateBusinessInviteCodeInput, CreateBusinessInviteCodeResult>(
    "createBusinessInviteCode"
  );
  const res = await callable({
    ...input,
    platform: input.platform ?? "web",
  });
  return parseCreateResult(res?.data ?? res);
}

export async function redeemBusinessInviteCode(
  code: string
): Promise<RedeemBusinessInviteCodeResult> {
  const normalized = code.trim().toUpperCase();
  const callable = getCallable<{ code: string }, RedeemBusinessInviteCodeResult>(
    "redeemBusinessInviteCode"
  );
  const res = await callable({ code: normalized });
  return parseRedeemResult(res?.data ?? res);
}

export async function listBusinessInvites(orgId: string): Promise<BusinessInviteListItem[]> {
  try {
    const callable = getCallable<{ orgId: string }, { invites: BusinessInviteListItem[] }>(
      "listBusinessInvites"
    );
    const res = await callable({ orgId });
    return parseListResult(res?.data ?? res);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "").toLowerCase();
    if (code === "functions/not-found" || msg.includes("not found")) {
      return [];
    }
    throw error;
  }
}

export async function fetchBusinessInviteDisplay(
  orgId: string,
  inviteId: string,
  options?: { regenerate?: boolean }
): Promise<CreateBusinessInviteCodeResult> {
  const callable = getCallable<
    { orgId: string; inviteId: string; regenerate?: boolean },
    GetBusinessInviteDisplayResult
  >("getBusinessInviteDisplay");
  const res = await callable({
    orgId,
    inviteId,
    regenerate: options?.regenerate === true,
  });
  const data = (res?.data ?? res) as GetBusinessInviteDisplayResult;
  const result = parseCreateResult({
    inviteId: data.inviteId,
    code: data.code,
    deepLink: data.deepLink,
    webJoinUrl: data.webJoinUrl?.startsWith("http")
      ? data.webJoinUrl
      : undefined,
    expiresAt: data.expiresAt,
    maxUses: data.maxUses,
    requiresApproval: data.requiresApproval,
  });
  if (!data.webJoinUrl?.startsWith("http") && data.code) {
    result.webJoinUrl = buildWebJoinUrl(data.code);
  }
  cacheBusinessInviteCode(orgId, result, {
    emailLower: data.emailLower,
  });
  return result;
}

type GetBusinessInviteDisplayResult = {
  inviteId: string;
  code: string;
  deepLink?: string;
  webJoinUrl?: string;
  expiresAt?: string | null;
  maxUses?: number;
  requiresApproval?: boolean;
  emailLower?: string | null;
  regenerated?: boolean;
};

export async function revokeBusinessInvite(orgId: string, inviteId: string): Promise<void> {
  const callable = getCallable<{ orgId: string; inviteId: string }, { ok: boolean }>(
    "revokeBusinessInvite"
  );
  await callable({ orgId, inviteId });
}

export async function acceptLegacyInviteToken(
  token: string
): Promise<{ orgId: string; role: string; alreadyMember?: boolean }> {
  const callable = getCallable<
    { token: string },
    { orgId: string; role: string; alreadyMember?: boolean }
  >("acceptLegacyInviteToken");
  const res = await callable({ token: token.trim() });
  const data = (res?.data ?? res) as { orgId: string; role: string; alreadyMember?: boolean };
  if (typeof data.orgId !== "string") {
    throw new Error("Invalid acceptLegacyInviteToken response.");
  }
  return data;
}

export function getInviteListJoinUrl(item: BusinessInviteListItem): string | null {
  if (item.code) {
    return buildWebJoinUrl(item.code);
  }
  return null;
}

const INVITE_CODE_CACHE_PREFIX = "staveto.businessInviteCode.";
const INVITE_EMAIL_CACHE_PREFIX = "staveto.businessInviteEmail.";

function inviteCodeCacheKey(orgId: string, inviteId: string): string {
  return `${INVITE_CODE_CACHE_PREFIX}${orgId}.${inviteId}`;
}

function inviteEmailCacheKey(orgId: string, inviteId: string): string {
  return `${INVITE_EMAIL_CACHE_PREFIX}${orgId}.${inviteId}`;
}

export function cacheBusinessInviteEmail(
  orgId: string,
  inviteId: string,
  emailLower: string
): void {
  if (typeof window === "undefined") return;
  const normalized = emailLower.trim().toLowerCase();
  if (!normalized) return;
  try {
    localStorage.setItem(inviteEmailCacheKey(orgId, inviteId), normalized);
  } catch {
    /* ignore */
  }
}

export function readCachedBusinessInviteEmail(
  orgId: string,
  inviteId: string
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(inviteEmailCacheKey(orgId, inviteId));
    return value?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function readCachedBusinessInvitePayload(
  orgId: string,
  inviteId: string
): CachedBusinessInvitePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      sessionStorage.getItem(inviteCodeCacheKey(orgId, inviteId)) ??
      localStorage.getItem(inviteCodeCacheKey(orgId, inviteId));
    if (!raw) return null;
    return parseCachedInvitePayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Resolves invite email from list item, session cache, or localStorage. */
export function resolveInviteEmailLower(
  orgId: string,
  item: BusinessInviteListItem
): string | null {
  if (item.emailLower) return item.emailLower;
  const fromLocal = readCachedBusinessInviteEmail(orgId, item.inviteId);
  if (fromLocal) return fromLocal;
  const fromSession = readCachedBusinessInvitePayload(orgId, item.inviteId);
  return fromSession?.emailLower ?? null;
}

/** Persists full invite code in session (direct_email codes are not returned by list API). */
export function cacheBusinessInviteCode(
  orgId: string,
  result: CreateBusinessInviteCodeResult,
  meta?: { role?: BusinessInviteRole | string; emailLower?: string | null; type?: string }
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedBusinessInvitePayload = {
      ...result,
      role: meta?.role,
      emailLower: meta?.emailLower ?? null,
      type: meta?.type ?? (meta?.emailLower ? "direct_email" : "join_code"),
    };
    sessionStorage.setItem(inviteCodeCacheKey(orgId, result.inviteId), JSON.stringify(payload));
    localStorage.setItem(inviteCodeCacheKey(orgId, result.inviteId), JSON.stringify(payload));
    if (meta?.emailLower) {
      cacheBusinessInviteEmail(orgId, result.inviteId, meta.emailLower);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function readCachedBusinessInviteCode(
  orgId: string,
  inviteId: string
): CreateBusinessInviteCodeResult | null {
  const payload = readCachedBusinessInvitePayload(orgId, inviteId);
  if (!payload) return null;
  return parseCreateResult(payload);
}

export function resolveBusinessInviteDisplay(
  orgId: string,
  item: BusinessInviteListItem
): CreateBusinessInviteCodeResult | null {
  const cached = readCachedBusinessInviteCode(orgId, item.inviteId);
  if (cached) return cached;

  if (item.code) {
    return {
      inviteId: item.inviteId,
      code: item.code,
      webJoinUrl: buildWebJoinUrl(item.code),
      deepLink: item.deepLink ?? undefined,
      expiresAt: item.expiresAt,
      maxUses: item.maxUses,
      requiresApproval: item.requiresApproval,
    };
  }

  return null;
}

export function buildLegacyInviteDisplay(token: string, inviteId: string): CreateBusinessInviteCodeResult {
  const webJoinUrl = buildLegacyTokenJoinUrl(token);
  return {
    inviteId,
    code: "",
    webJoinUrl,
  };
}

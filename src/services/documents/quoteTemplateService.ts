/**
 * Company-scoped quote template persistence.
 * Path: organizations/{orgId}/documentTemplates/default-quote
 */
import {
  getFirestoreInstance,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "@/lib/firebase";
import {
  DEFAULT_QUOTE_TEMPLATE,
  DEFAULT_QUOTE_TEMPLATE_ID,
  normalizeQuoteTemplate,
  parseQuoteTemplateDoc,
  quoteTemplateDocPath,
  templateToFirestorePayload,
  type QuoteDocumentTemplate,
} from "@/lib/documents/quoteTemplateContract";
import { isOrganizationMember } from "@/services/organization/organizationService";

function toIso(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

export async function canEditQuoteTemplate(orgId: string, userId: string): Promise<boolean> {
  if (!orgId?.trim() || !userId?.trim()) return false;
  const membership = await isOrganizationMember(orgId, userId);
  if (!membership.member) return false;
  const role = membership.role ?? "";
  return role === "owner" || role === "admin";
}

export async function getDefaultQuoteTemplate(orgId: string): Promise<QuoteDocumentTemplate | null> {
  if (!orgId?.trim()) return null;

  const db = getFirestoreInstance();
  if (!db) return null;

  const ref = doc(db, quoteTemplateDocPath(orgId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, unknown>;
  if (data.type !== "quote") return null;

  return parseQuoteTemplateDoc(data, {
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined,
  });
}

export async function ensureDefaultQuoteTemplate(orgId: string): Promise<QuoteDocumentTemplate> {
  try {
    const existing = await getDefaultQuoteTemplate(orgId);
    return existing ?? { ...DEFAULT_QUOTE_TEMPLATE };
  } catch {
    return { ...DEFAULT_QUOTE_TEMPLATE };
  }
}

export type LoadQuoteTemplateResult = {
  template: QuoteDocumentTemplate;
  persisted: boolean;
  loadWarning?: "network" | "permission";
};

/** Settings UI — never block on missing template document. */
export async function loadQuoteTemplateForSettings(
  orgId: string
): Promise<LoadQuoteTemplateResult> {
  if (!orgId?.trim()) {
    return { template: { ...DEFAULT_QUOTE_TEMPLATE }, persisted: false };
  }

  try {
    const existing = await getDefaultQuoteTemplate(orgId);
    if (existing) {
      return { template: existing, persisted: true };
    }
    return { template: { ...DEFAULT_QUOTE_TEMPLATE }, persisted: false };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    const message = String((err as { message?: string })?.message ?? "").toLowerCase();
    const permission =
      code === "permission-denied" ||
      code === "firestore/permission-denied" ||
      message.includes("missing or insufficient permissions");

    return {
      template: { ...DEFAULT_QUOTE_TEMPLATE },
      persisted: false,
      loadWarning: permission ? "permission" : "network",
    };
  }
}

export async function saveDefaultQuoteTemplate(
  orgId: string,
  userId: string,
  templatePatch: Partial<QuoteDocumentTemplate>
): Promise<QuoteDocumentTemplate> {
  if (!orgId?.trim() || !userId?.trim()) {
    throw new Error("QUOTE_TEMPLATE_SCOPE_MISSING");
  }
  if (!(await canEditQuoteTemplate(orgId, userId))) {
    throw new Error("QUOTE_TEMPLATE_ACCESS_DENIED");
  }

  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const current = await ensureDefaultQuoteTemplate(orgId);
  const merged = normalizeQuoteTemplate({
    ...current,
    ...templatePatch,
    type: "quote",
    isDefault: true,
    settings: { ...current.settings, ...templatePatch.settings },
    theme: { ...current.theme, ...templatePatch.theme },
    layout: { ...current.layout, ...templatePatch.layout },
    visibility: { ...current.visibility, ...templatePatch.visibility },
  });

  const ref = doc(db, quoteTemplateDocPath(orgId));
  const snap = await getDoc(ref);
  const payload = templateToFirestorePayload(merged, userId);

  await setDoc(
    ref,
    {
      ...payload,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );

  return merged;
}

export async function resetDefaultQuoteTemplate(
  orgId: string,
  userId: string
): Promise<QuoteDocumentTemplate> {
  return saveDefaultQuoteTemplate(orgId, userId, DEFAULT_QUOTE_TEMPLATE);
}

/** Fail-closed read for print — verifies orgId matches requested org. */
export async function loadQuoteTemplateForOrg(
  orgId: string | null | undefined,
  activeOrgId: string | null | undefined
): Promise<QuoteDocumentTemplate> {
  if (!orgId?.trim() || !activeOrgId?.trim() || orgId !== activeOrgId) {
    return { ...DEFAULT_QUOTE_TEMPLATE };
  }
  const template = await getDefaultQuoteTemplate(orgId);
  return template ?? { ...DEFAULT_QUOTE_TEMPLATE };
}

export { DEFAULT_QUOTE_TEMPLATE_ID, quoteTemplateDocPath };

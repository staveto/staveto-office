/** Maps Firebase callable / onboarding org-creation errors to user-facing copy keys. */
export function resolveBusinessOrgErrorKey(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? "";
  const message = (e?.message ?? "").toLowerCase();

  if (
    code === "functions/not-found" ||
    code === "functions/unavailable" ||
    message.includes("not-found") ||
    message.includes("could not connect") ||
    message.includes("failed to fetch")
  ) {
    return "onboarding.error.businessOrgNotDeployed";
  }

  if (
    code === "functions/unauthenticated" ||
    code === "functions/permission-denied" ||
    message.includes("authentication required")
  ) {
    return "onboarding.error.businessOrgAuth";
  }

  if (
    code === "functions/failed-precondition" ||
    message.includes("already have a business organization")
  ) {
    return "onboarding.error.businessOrgDuplicate";
  }

  if (code === "functions/invalid-argument") {
    return "onboarding.error.businessOrgInvalid";
  }

  return "onboarding.error.save";
}

function extractCallableMessage(err: unknown): string | null {
  const e = err as { message?: string };
  const message = e?.message?.trim();
  if (!message) return null;
  // Firebase client wraps server text after the code prefix.
  const withoutCode = message.replace(/^FirebaseError:\s*/i, "").trim();
  const detail = withoutCode.replace(/^functions\/[\w-]+:\s*/i, "").trim();
  return detail && detail !== withoutCode ? detail : withoutCode || null;
}

export function resolveBusinessOrgErrorMessage(
  err: unknown,
  t: (key: string) => string
): string {
  const key = resolveBusinessOrgErrorKey(err);
  const base = t(key);
  const detail = extractCallableMessage(err);

  if (key === "onboarding.error.businessOrgInvalid" && detail) {
    const lower = detail.toLowerCase();
    if (lower.includes("legalname is required") || lower.includes("countrycode is required")) {
      return t("onboarding.error.businessOrgNotDeployed");
    }
    if (process.env.NODE_ENV === "development") {
      return `${base} (${detail})`;
    }
  }

  return base;
}

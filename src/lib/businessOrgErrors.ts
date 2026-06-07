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

export function resolveBusinessOrgErrorMessage(
  err: unknown,
  t: (key: string) => string
): string {
  return t(resolveBusinessOrgErrorKey(err));
}

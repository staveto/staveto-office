/** Maps Firebase Auth errors to i18n keys under login.error.* */
export function getAuthErrorMessageKey(error: unknown): string {
  const err = error as { code?: string; message?: string };
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();

  if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
    return "login.error.invalidCredential";
  }
  if (code === "auth/user-not-found" || code === "auth/invalid-email") {
    return "login.error.invalidCredential";
  }
  if (code === "auth/too-many-requests") {
    return "login.error.tooManyRequests";
  }
  if (code === "auth/user-disabled") {
    return "login.error.userDisabled";
  }
  if (code === "auth/popup-closed-by-user" || msg.includes("popup-closed")) {
    return "login.error.popupClosed";
  }
  if (code === "auth/network-request-failed") {
    return "login.error.network";
  }
  if (code === "auth/missing-email") {
    return "forgotPassword.error.missingEmail";
  }
  return "login.error";
}

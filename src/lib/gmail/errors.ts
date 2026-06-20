/** Map Gmail OAuth/API error codes to i18n keys. */
export function gmailErrorMessageKey(code: string): string {
  switch (code) {
    case "FORBIDDEN":
      return "gmail.error.forbidden";
    case "UNAUTHORIZED":
    case "NOT_SIGNED_IN":
      return "gmail.error.unauthorized";
    case "GMAIL_NOT_CONFIGURED":
      return "gmail.error.notConfigured";
    case "GMAIL_ADMIN_NOT_CONFIGURED":
    case "ADMIN_NOT_CONFIGURED":
      return "gmail.error.adminNotConfigured";
    case "ADMIN_UNAVAILABLE":
      return "gmail.error.adminUnavailable";
    case "token":
    case "OAUTH_TOKEN_FAILED":
      return "gmail.error.tokenExchange";
    case "ORG_REQUIRED":
      return "gmail.error.orgRequired";
    case "LOAD_FAILED":
    case "UPDATE_FAILED":
      return "inbox.error.loadList";
    case "SYNC_FAILED":
      return "inbox.error.syncFailed";
    case "GMAIL_NOT_CONNECTED":
      return "inbox.error.notConnected";
    case "TOKEN_REFRESH_FAILED":
      return "gmail.error.tokenRefresh";
    default:
      return "gmail.error.connect";
  }
}

export function resolveGmailError(err: unknown, t: (key: string) => string): string {
  const raw = err instanceof Error ? err.message : "OAUTH_START_FAILED";
  if (raw.includes("Missing or insufficient permissions")) {
    return t("inbox.error.permissions");
  }
  return t(gmailErrorMessageKey(raw));
}

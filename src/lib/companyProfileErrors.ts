/** Map logo upload errors to i18n keys (settings.companyProfile.*). */
export function mapCompanyLogoError(err: unknown): string {
  const code = String((err as { code?: string })?.code ?? "");
  const message = err instanceof Error ? err.message : String(err ?? "");

  if (message === "COMPANY_PROFILE_ACCESS_DENIED") return "settings.companyProfile.logoErrorAccess";
  if (message === "COMPANY_PROFILE_LOGO_UNSUPPORTED") return "settings.companyProfile.logoErrorType";
  if (message === "COMPANY_PROFILE_LOGO_TOO_LARGE") return "settings.companyProfile.logoErrorSize";
  if (message === "COMPANY_PROFILE_STORAGE_NOT_CONFIGURED") {
    return "settings.companyProfile.logoErrorStorageConfig";
  }
  if (message === "COMPANY_PROFILE_LOGO_UPLOAD_FAILED") {
    return "settings.companyProfile.logoError";
  }
  if (
    code.includes("storage/unauthorized") ||
    code.includes("permission-denied") ||
    message.toLowerCase().includes("unauthorized") ||
    message.toLowerCase().includes("permission")
  ) {
    if (message === "COMPANY_PROFILE_ACCESS_DENIED") {
      return "settings.companyProfile.logoErrorAccess";
    }
    if (code.includes("storage/")) {
      return "settings.companyProfile.logoErrorStorageRules";
    }
    return "settings.companyProfile.logoErrorFirestoreRules";
  }

  return "settings.companyProfile.logoError";
}

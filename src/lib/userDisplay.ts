export type UserDisplayInput = {
  displayName?: string | null;
  name?: string | null;
  fullName?: string | null;
  userNameSnapshot?: string | null;
  email?: string | null;
  uid?: string;
};

/** Best label for manager UI — never prefer raw email when a name exists. */
export function getBestUserDisplayName(user: UserDisplayInput): string {
  const pick = (...values: (string | null | undefined)[]) => {
    for (const value of values) {
      const trimmed = value?.trim();
      if (trimmed) return trimmed;
    }
    return "";
  };

  const fromNames = pick(
    user.displayName,
    user.name,
    user.fullName,
    user.userNameSnapshot
  );
  if (fromNames) return fromNames;

  const email = user.email?.trim();
  if (email) {
    const prefix = email.split("@")[0]?.trim();
    if (prefix) return prefix;
    return email;
  }

  return user.uid?.slice(0, 8) || "?";
}

/** Display initials from a person's name or email fallback. */
export function getUserInitials(
  name?: string | null,
  email?: string | null
): string {
  if (name?.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

/** Initials for a company name (up to 2 characters). */
export function getCompanyInitials(name?: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

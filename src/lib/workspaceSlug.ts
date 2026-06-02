/**
 * Organization workspace slug utilities (tenant subdomains).
 */

export const RESERVED_WORKSPACE_SLUGS = new Set([
  "app",
  "www",
  "admin",
  "api",
  "mail",
  "support",
  "help",
  "blog",
  "login",
  "register",
  "dashboard",
  "billing",
  "settings",
  "firebase",
  "google",
]);

const SLUG_MIN_LENGTH = 3;
const SLUG_MAX_LENGTH = 40;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Strip accents and normalize user input to a slug candidate. */
export function normalizeWorkspaceSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isReservedWorkspaceSlug(slug: string): boolean {
  return RESERVED_WORKSPACE_SLUGS.has(slug.toLowerCase());
}

export type WorkspaceSlugValidationResult =
  | { valid: true; slug: string }
  | { valid: false; error: string };

export function validateWorkspaceSlug(slug: string): WorkspaceSlugValidationResult {
  const normalized = normalizeWorkspaceSlug(slug);

  if (!normalized) {
    return { valid: false, error: "Slug is required." };
  }
  if (normalized.length < SLUG_MIN_LENGTH) {
    return { valid: false, error: `Slug must be at least ${SLUG_MIN_LENGTH} characters.` };
  }
  if (normalized.length > SLUG_MAX_LENGTH) {
    return { valid: false, error: `Slug must be at most ${SLUG_MAX_LENGTH} characters.` };
  }
  if (!SLUG_PATTERN.test(normalized)) {
    return {
      valid: false,
      error: "Use lowercase letters, numbers, and hyphens only (no spaces).",
    };
  }
  if (normalized.startsWith("-") || normalized.endsWith("-")) {
    return { valid: false, error: "Slug cannot start or end with a hyphen." };
  }
  if (isReservedWorkspaceSlug(normalized)) {
    return { valid: false, error: "This subdomain is reserved." };
  }

  return { valid: true, slug: normalized };
}

export function buildSubdomainPreviewUrl(
  slug: string,
  baseDomain = process.env.NEXT_PUBLIC_STAVETO_BASE_DOMAIN ?? "staveto.com"
): string {
  return `https://${slug}.${baseDomain}`;
}

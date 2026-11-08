/**
 * Public marketing site (staveto.com / www) vs office app (app.staveto.com).
 * Pure helpers so middleware and tests stay free of Firebase.
 */

export const APP_ORIGIN = "https://app.staveto.com";

export const MARKETING_HOSTS = new Set(["staveto.com", "www.staveto.com"]);

/** Office routes that must not render on the marketing host. */
const OFFICE_PATH_PREFIXES = [
  "/app",
  "/api",
  "/login",
  "/register",
  "/forgot-password",
  "/join",
  "/onboarding",
  "/subscription",
  "/estimates",
  "/pdf-test",
  "/marking-test",
];

/** Public marketing paths (browser URL on staveto.com). */
export const MARKETING_PATHS = [
  "/",
  "/product",
  "/about",
  "/contact",
  "/pricing",
  "/privacy",
  "/terms-conditions",
  "/cookie-policy",
  "/delete-account",
  "/data-processing",
  "/legal",
  "/subprocessor",
] as const;

export type MarketingPath = (typeof MARKETING_PATHS)[number];

const MARKETING_PATH_SET = new Set<string>(MARKETING_PATHS);

export function stripHost(hostname: string): string {
  return hostname.split(":")[0].toLowerCase();
}

export function isMarketingHost(hostname: string): boolean {
  return MARKETING_HOSTS.has(stripHost(hostname));
}

export function isOfficeAppPath(pathname: string): boolean {
  return OFFICE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Internal App Router path for a public marketing URL. */
export function toSitePath(pathname: string): string | null {
  if (!MARKETING_PATH_SET.has(pathname)) return null;
  if (pathname === "/") return "/site";
  return `/site${pathname}`;
}

/** Browser path used in nav. On localhost this stays under /site. */
export function marketingHref(host: string, path: MarketingPath | "/"): string {
  if (isMarketingHost(host)) return path;
  if (path === "/") return "/site";
  return `/site${path}`;
}

export type MarketingRequestAction =
  | { type: "next" }
  | { type: "redirect-app"; pathname: string }
  | { type: "redirect-public"; pathname: string }
  | { type: "rewrite"; pathname: string };

/**
 * What middleware should do for this host + path.
 * Localhost and app.staveto.com are left untouched so / still enters the office app.
 */
export function resolveMarketingRequest(
  host: string,
  pathname: string
): MarketingRequestAction {
  if (!isMarketingHost(host)) return { type: "next" };

  if (pathname === "/site" || pathname.startsWith("/site/")) {
    const pub = pathname === "/site" ? "/" : pathname.slice("/site".length) || "/";
    return { type: "redirect-public", pathname: pub };
  }

  if (isOfficeAppPath(pathname)) {
    return { type: "redirect-app", pathname };
  }

  const rewrite = toSitePath(pathname);
  if (rewrite) return { type: "rewrite", pathname: rewrite };

  return { type: "next" };
}

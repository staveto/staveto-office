/**
 * Same-origin proxy for PDF downloads.
 *
 * Browser fetches of Firebase Storage download URLs can fail on CORS
 * (VPN/corporate proxies strip headers). Streaming the file through our own
 * origin sidesteps CORS entirely. Only Firebase/GCS hosts are allowed and the
 * URL must already carry its own access token — no privilege escalation.
 *
 * Behind TLS-intercepting VPNs, Node's default trust store may miss the
 * corporate CA. We append certs/win-ca-bundle.pem (see scripts/refresh-win-ca.ps1)
 * so /api/pdf-proxy works even when NODE_EXTRA_CA_CERTS did not propagate.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import tls from "node:tls";
import { Agent, fetch as undiciFetch } from "undici";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

let cachedAgent: Agent | null | undefined;

function getExtraCaPem(): string | null {
  const fromEnv = process.env.NODE_EXTRA_CA_CERTS?.trim();
  const candidates = [
    fromEnv,
    join(process.cwd(), "certs", "win-ca-bundle.pem"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf8");
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

/** Agent that trusts Node roots + optional Windows/corporate CA bundle. */
function getFetchAgent(): Agent | undefined {
  if (cachedAgent !== undefined) return cachedAgent ?? undefined;
  const extra = getExtraCaPem();
  if (!extra) {
    cachedAgent = null;
    return undefined;
  }
  cachedAgent = new Agent({
    connect: {
      ca: [...tls.rootCertificates, extra],
    },
  });
  return cachedAgent;
}

function isAllowedHost(hostname: string): boolean {
  if (ALLOWED_HOSTS.has(hostname)) return true;
  return hostname.endsWith(".firebasestorage.app");
}

function upstreamFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; message?: string } })
    .cause;
  const code = cause?.code || "";
  if (
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "CERT_HAS_EXPIRED" ||
    /certificate/i.test(err.message)
  ) {
    return (
      "Upstream TLS failed (corporate VPN/proxy CA). " +
      "Refresh certs: powershell -File scripts/refresh-win-ca.ps1 then restart npm run dev"
    );
  }
  return cause?.message || err.message || "Upstream fetch failed";
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new Response("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (target.protocol !== "https:" || !isAllowedHost(target.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  let upstream: Response;
  try {
    const agent = getFetchAgent();
    const res = agent
      ? await undiciFetch(target, {
          dispatcher: agent,
          // @ts-expect-error undici cache option differs slightly from DOM fetch
          cache: "no-store",
        })
      : await fetch(target, { cache: "no-store" });
    upstream = res as unknown as Response;
  } catch (err) {
    return new Response(upstreamFetchError(err), { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream HTTP ${upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}

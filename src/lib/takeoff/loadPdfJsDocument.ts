/**
 * Load a PDF for pdf.js in a CORS-safe way.
 *
 * - Worker is served statically from /pdf.worker.min.mjs (copied from
 *   node_modules by scripts/copy-pdf-worker.mjs). Bundler URL resolution of
 *   the worker is a common silent failure point in Next.js dev.
 * - Firebase Storage download URLs often fail when pdf.js fetches them
 *   cross-origin for page/font data. Fetching as ArrayBuffer first and
 *   passing `data` to getDocument avoids that class of failures.
 * - On failure we throw an Error whose message lists every attempted step,
 *   so viewers can show the real cause instead of a generic message.
 */

export type PdfJsLike = {
  GlobalWorkerOptions: { workerSrc: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDocument: (src?: any) => { promise: Promise<unknown> };
};

function errText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/** Fetch PDF bytes; returns null and records the problem when unusable. */
async function fetchPdfBytes(
  url: string,
  label: string,
  problems: string[]
): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) {
      problems.push(`${label}: HTTP ${res.status}`);
      return null;
    }
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength === 0) {
      problems.push(`${label}: empty response`);
      return null;
    }
    const head = new TextDecoder("ascii").decode(data.slice(0, 16));
    if (!head.includes("%PDF")) {
      problems.push(
        `${label}: not a PDF (starts with "${head.replace(/[^\x20-\x7e]/g, "?").slice(0, 12)}")`
      );
      return null;
    }
    return data;
  } catch (err) {
    problems.push(`${label}: ${errText(err)}`);
    return null;
  }
}

export async function loadPdfJsDocument(
  pdfjs: PdfJsLike,
  fileUrl: string
): Promise<unknown> {
  const problems: string[] = [];
  const isHttp = /^https?:\/\//i.test(fileUrl);

  // 1) Direct fetch — works when the storage host sends CORS headers.
  // 2) Same-origin proxy — bypasses CORS stripped by VPN/corporate proxies.
  const sources: Array<{ url: string; label: string }> = [
    { url: fileUrl, label: "fetch" },
  ];
  if (isHttp && typeof window !== "undefined") {
    sources.push({
      url: `/api/pdf-proxy?url=${encodeURIComponent(fileUrl)}`,
      label: "proxy",
    });
  }

  for (const source of sources) {
    const data = await fetchPdfBytes(source.url, source.label, problems);
    if (!data) continue;
    try {
      return await pdfjs.getDocument({ data }).promise;
    } catch (err) {
      problems.push(`pdfjs(${source.label}): ${errText(err)}`);
    }
  }

  // 3) Last resort: let pdf.js fetch the URL itself.
  try {
    return await pdfjs.getDocument({
      url: fileUrl,
      withCredentials: false,
    }).promise;
  } catch (err) {
    problems.push(`pdfjs(url): ${errText(err)}`);
    const detail = problems.join(" | ");
    // warn (not error) — the Next dev overlay must not hijack the screen.
    console.warn(`[staveto pdf] load failed: ${detail}`);
    throw new Error(detail);
  }
}

export function pdfJsWorkerSrc(): string {
  return "/pdf.worker.min.mjs";
}

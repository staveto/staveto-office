/**
 * Fresh end-to-end PDF analysis for the electrical acceptance drawing.
 *
 * Runs the SAME extraction pipeline as the deployed Cloud Function
 * (compiled modules from functions/lib): PDF page split → Gemini vision
 * per page with the SK knowledge context → strict merge → legend fold.
 *
 * Output: reports/ai-estimator/fresh-session-facts.json
 * (consumed by src/lib/ai/electricalPdfReport.acceptance.test.ts which
 * builds reports/ai-estimator/electrical-pdf-report.json)
 *
 * GEMINI_API_KEY resolution: env var first, otherwise Secret Manager via the
 * Firebase CLI refresh token (same project secret the deployed function uses).
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROJECT = process.env.FIREBASE_PROJECT_ID || "staveto-mvp-5f251";

const FIXTURE = join(ROOT, "fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf");
const OUT_DIR = join(ROOT, "reports/ai-estimator");
const OUT_FACTS = join(OUT_DIR, "fresh-session-facts.json");

// ---------------------------------------------------------------------------
// Phase 1 — fixture requirement
// ---------------------------------------------------------------------------
if (!existsSync(FIXTURE)) {
  console.error("Missing fixture: fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf");
  console.error(
    "Place the real electrical drawing PDF at that exact path (see fixtures/ai-estimator/README.md)."
  );
  console.error("End-to-end PDF extraction NOT verified — only Firestore replay fallback is available.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Gemini API key (env → Secret Manager via Firebase CLI token)
// ---------------------------------------------------------------------------
function readCliOauthClient() {
  const src = readFileSync(join(ROOT, "node_modules/firebase-tools/lib/api.js"), "utf8");
  const id = src.match(/FIREBASE_CLIENT_ID",\s*"([^"]+)"/)?.[1];
  const secret = src.match(/FIREBASE_CLIENT_SECRET",\s*"([^"]+)"/)?.[1];
  if (!id || !secret) throw new Error("Could not read OAuth client from firebase-tools.");
  return { id, secret };
}

function readCliRefreshToken() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  for (const p of [
    join(home, ".config", "configstore", "firebase-tools.json"),
    join(process.env.APPDATA ?? "", "configstore", "firebase-tools.json"),
  ]) {
    try {
      const token = JSON.parse(readFileSync(p, "utf8"))?.tokens?.refresh_token;
      if (token) return token;
    } catch {
      /* try next */
    }
  }
  throw new Error("No Firebase CLI refresh token — run: npx firebase-tools login");
}

async function getAccessToken() {
  const client = readCliOauthClient();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: readCliRefreshToken(),
      client_id: client.id,
      client_secret: client.secret,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function resolveGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const token = await getAccessToken();
  const res = await fetch(
    `https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/GEMINI_API_KEY/versions/latest:access`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const json = await res.json();
  if (!json.payload?.data) {
    throw new Error(`Cannot access GEMINI_API_KEY secret: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return Buffer.from(json.payload.data, "base64").toString("utf8").trim();
}

// ---------------------------------------------------------------------------
// SK knowledge context from seed packs (same content as seeded Firestore docs;
// mirrors functions/src/estimator/knowledgeContext.ts formatting)
// ---------------------------------------------------------------------------
function buildKnowledgeContextFromSeeds() {
  const load = (f) => JSON.parse(readFileSync(join(ROOT, "data/knowledge", f), "utf8"));
  const symbols = load("electrical-symbols-sk.json");
  const assemblies = load("electrical-assemblies-sk.json");
  const labor = load("electrical-labor-rules-sk.json");

  const lines = [
    "KNOWN SYMBOL ALIASES (country/trade specific — map matching text to normalizedPoint):",
  ];
  for (const s of symbols.symbols.slice(0, 40)) {
    lines.push(`- ${s.normalizedPoint}: ${s.aliases.slice(0, 6).join(" | ")}`);
  }
  lines.push("ASSEMBLY CONCEPTS (a symbol is a technical point, not a product):");
  for (const a of assemblies.assemblies.slice(0, 20)) {
    const mats = (a.materialComponents ?? [])
      .slice(0, 4)
      .map((m) => m.category)
      .filter(Boolean)
      .join(", ");
    lines.push(`- ${a.normalizedPoint} → ${a.title}${mats ? ` [${mats}]` : ""}`);
  }
  lines.push("LABOR HINTS (minutes per unit — do not invent different productivity):");
  for (const r of labor.laborRules.slice(0, 12)) {
    if (typeof r.defaultMinutesPerUnit === "number") {
      lines.push(`- ${r.category}: ~${r.defaultMinutesPerUnit} min/unit`);
    }
  }
  return {
    text: lines.join("\n").slice(0, 4000),
    packIds: [symbols.pack.id, assemblies.pack.id, labor.pack.id],
  };
}

// ---------------------------------------------------------------------------
// Fresh extraction — same compiled pipeline as the Cloud Function
// ---------------------------------------------------------------------------
async function main() {
  process.env.GEMINI_API_KEY = await resolveGeminiKey();
  console.log("GEMINI_API_KEY resolved (env/Secret Manager).");

  const { splitPdfIntoPages } = require(join(ROOT, "functions/lib/estimator/pdfPageSplit.js"));
  const { extractFactsFromAttachment } = require(join(ROOT, "functions/lib/estimator/estimatorGemini.js"));
  const { mergeEstimatorFactsStrict } = require(join(ROOT, "functions/lib/estimator/estimatorMerge.js"));
  const { convertTechnicalDrawingFactsToEstimatorItems, validateEstimatorFacts } = require(
    join(ROOT, "functions/lib/estimator/symbolReading.js")
  );

  const knowledge = buildKnowledgeContextFromSeeds();
  console.log(`Knowledge context: ${knowledge.text.length} chars, packs: ${knowledge.packIds.join(", ")}`);

  const bytes = readFileSync(FIXTURE);
  const fileName = "08_Znacenie_elektrika_2.pdf";
  const sessionId = `fresh_pdf_${Date.now()}`;

  const split = await splitPdfIntoPages(bytes, fileName);
  const pages = split.ok ? split.pages : [{ pageNumber: 1, bytes, fileName }];
  console.log(
    split.ok
      ? `PDF split: ${split.pageCount} pages, processing ${pages.length}${split.truncated ? " (truncated)" : ""}`
      : `PDF split failed (${split.reason}) — processing whole PDF as one attachment`
  );

  const parts = [];
  const pageErrors = [];
  for (const page of pages) {
    const started = Date.now();
    try {
      const part = await extractFactsFromAttachment({
        language: "sk",
        countryCode: "SK",
        currency: "EUR",
        tradeType: "electrical",
        attachment: {
          fileId: `fixtures/ai-estimator/${fileName}`,
          fileName,
          mimeType: "application/pdf",
          bytes: page.bytes,
          pageNumber: split.ok && split.pageCount > 1 ? page.pageNumber : undefined,
        },
        sessionId,
        enableSymbolReading: true,
        knowledgeContext: knowledge.text,
      });
      parts.push(part);
      console.log(
        `page ${page.pageNumber}: rooms ${part.rooms.length}, legend ${part.legendEntries?.length ?? 0}, occurrences ${part.symbolOccurrences?.length ?? 0}, items ${part.extractedItems.length} (${Math.round((Date.now() - started) / 1000)}s)`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pageErrors.push({ page: page.pageNumber, message: msg });
      console.error(`page ${page.pageNumber}: FAILED — ${msg}`);
    }
  }

  if (parts.length === 0) {
    console.error("Fresh PDF extraction produced no parts — acceptance FAILED.");
    process.exit(1);
  }

  const merged = mergeEstimatorFactsStrict(sessionId, parts);
  const converted = convertTechnicalDrawingFactsToEstimatorItems(merged);
  const validation = validateEstimatorFacts(converted, { visionUsed: true, textOnlyUsed: false });
  const facts = {
    ...converted,
    warnings: [...new Set([...(converted.warnings ?? []), ...validation.warnings])],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_FACTS,
    JSON.stringify(
      {
        meta: {
          extractionMode: "fresh_pdf_extraction",
          fileName,
          fixturePath: "fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf",
          pagesInPdf: split.ok ? split.pageCount : 1,
          pagesProcessed: parts.length,
          pageErrors,
          knowledgePackIds: knowledge.packIds,
          model: process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash-lite",
          analyzedAt: new Date().toISOString(),
        },
        facts,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `\nFresh facts: rooms ${facts.rooms.length}, legend ${facts.legendEntries?.length ?? 0}, occurrences ${facts.symbolOccurrences?.length ?? 0}, items ${facts.extractedItems.length}, unknown ${facts.unknownSymbols?.length ?? 0}`
  );
  console.log(`Saved → ${OUT_FACTS}`);
}

main().catch((e) => {
  console.error("Fresh PDF analysis failed:", e?.stack ?? e);
  process.exit(1);
});

import { describe, expect, it } from "vitest";
import {
  MANUAL_QUOTE_AUTOSAVE_FORBIDDEN_OPS,
  MANUAL_QUOTE_EDITOR_FORBIDDEN_AI_CALLABLES,
  nextAutosaveGeneration,
  projectQuoteItemsCollectionPath,
  shouldApplyAutosaveResult,
  workspaceCatalogItemsCollectionPath,
} from "./quoteDraftAutosave";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("quoteDraftAutosave paths (Phase 1C SoT)", () => {
  it("draft source of truth is projects/{id}/quoteItems", () => {
    expect(projectQuoteItemsCollectionPath("abc")).toBe("projects/abc/quoteItems");
  });

  it("catalog lives under workspaces/{key}/catalogItems (separate)", () => {
    expect(workspaceCatalogItemsCollectionPath("org1")).toBe(
      "workspaces/org1/catalogItems"
    );
  });

  it("never uses a parallel quoteDrafts collection name", () => {
    expect(projectQuoteItemsCollectionPath("x")).not.toContain("quoteDrafts");
  });
});

describe("quoteDraftAutosave generations", () => {
  it("increments generation for rapid edits", () => {
    let g = 0;
    g = nextAutosaveGeneration(g);
    g = nextAutosaveGeneration(g);
    g = nextAutosaveGeneration(g);
    expect(g).toBe(3);
  });

  it("discards stale in-flight writes after newer edits", () => {
    const afterEdit = nextAutosaveGeneration(1);
    expect(shouldApplyAutosaveResult(1, afterEdit)).toBe(false);
    expect(shouldApplyAutosaveResult(afterEdit, afterEdit)).toBe(true);
  });

  it("keeps latest of rapid qty/price style sequence", () => {
    let latest = 0;
    const writes: number[] = [];
    for (let i = 0; i < 5; i++) {
      latest = nextAutosaveGeneration(latest);
      writes.push(latest);
    }
    const last = writes[writes.length - 1]!;
    expect(writes.filter((w) => shouldApplyAutosaveResult(w, last))).toEqual([last]);
  });
});

describe("manual quote editor contracts", () => {
  it("DraftQuoteItemsPanel source does not call AI or upsert on module load surface", () => {
    const panelPath = resolve(
      __dirname,
      "../components/jobs/DraftQuoteItemsPanel.tsx"
    );
    const src = readFileSync(panelPath, "utf8");
    for (const name of MANUAL_QUOTE_EDITOR_FORBIDDEN_AI_CALLABLES) {
      expect(src.includes(name)).toBe(false);
    }
    // Upsert is allowed only on explicit CTA — present as import/call for button, not in autosave helpers.
    expect(src.includes("updateQuoteDraftItem")).toBe(true);
    expect(src.includes("createQuoteDraftItem")).toBe(true);
    expect(src.includes("deleteQuoteDraftItem")).toBe(true);
    expect(src.includes("deleteCatalogItem")).toBe(false);
    expect(src.includes("updateCatalogItem")).toBe(false);
    expect(src.includes("quoteDrafts")).toBe(false);
    // Explicit create-quote CTA may call upsert — autosave path must not be the only reference.
    expect(src.includes("upsertQuoteFromProject")).toBe(true);
    expect(MANUAL_QUOTE_AUTOSAVE_FORBIDDEN_OPS.length).toBeGreaterThan(0);
  });

  it("deleteQuoteDraftItem service only deletes under quoteItems", () => {
    const projectsPath = resolve(__dirname, "./projects.ts");
    const src = readFileSync(projectsPath, "utf8");
    const deleteFn = src.slice(
      src.indexOf("export async function deleteQuoteDraftItem"),
      src.indexOf("export async function hasProjectAccess")
    );
    expect(deleteFn).toContain('projects", projectId, "quoteItems"');
    expect(deleteFn).not.toContain("catalogItems");
    expect(deleteFn).not.toContain("quoteDrafts");
  });
});

/**
 * Own price-list items ("Vlastné položky") — CRUD under
 * workspaces/{wsKey}/catalogItems. Items are quote templates: they carry
 * kind (product|work), unit and a selling price.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreDocs = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/firebase", () => ({
  getFirestoreInstance: vi.fn(() => ({})),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getDocs: vi.fn(async (ref: { path: string }) => {
    const prefix = `${ref.path}/`;
    const docs = [...firestoreDocs.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
    return { docs };
  }),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    firestoreDocs.set(ref.path, data);
  }),
  updateDoc: vi.fn(async (ref: { path: string }, patch: Record<string, unknown>) => {
    const existing = firestoreDocs.get(ref.path);
    if (!existing) throw new Error("not found");
    firestoreDocs.set(ref.path, { ...existing, ...patch });
  }),
  deleteDoc: vi.fn(async (ref: { path: string }) => {
    firestoreDocs.delete(ref.path);
  }),
}));

import {
  createCatalogItem,
  deleteCatalogItem,
  listCatalogItems,
  updateCatalogItem,
} from "./catalogItemsService";
import {
  importParsedCatalogRows,
  parseCatalogCsv,
  parseCatalogPrice,
  normalizeCatalogUnit,
} from "./catalogCsvImport";

beforeEach(() => {
  firestoreDocs.clear();
});

describe("createCatalogItem", () => {
  it("stores a product under workspaces/{wsKey}/catalogItems with defaults", async () => {
    const item = await createCatalogItem("org1", "u1", {
      kind: "product",
      name: "  Zásuvka 230V premium  ",
      unit: "pcs",
      unitPrice: 4.5,
    });
    expect(item.id).toMatch(/^cat_/);
    expect(item.name).toBe("Zásuvka 230V premium");
    expect(item.currency).toBe("EUR");
    expect(item.createdBy).toBe("u1");
    expect(firestoreDocs.get(`workspaces/org1/catalogItems/${item.id}`)).toMatchObject({
      kind: "product",
      workspaceKey: "org1",
    });
  });

  it("never stores undefined optional fields (Firestore rejects them)", async () => {
    const item = await createCatalogItem("org1", "u1", {
      kind: "work",
      name: "Montáž zásuvky",
      unit: "hour",
      unitPrice: 25,
    });
    const stored = firestoreDocs.get(`workspaces/org1/catalogItems/${item.id}`)!;
    expect("description" in stored).toBe(false);
    expect("category" in stored).toBe(false);
  });

  it("clamps negative price to 0", async () => {
    const item = await createCatalogItem("org1", "u1", {
      kind: "product",
      name: "X",
      unit: "pcs",
      unitPrice: -3,
    });
    expect(item.unitPrice).toBe(0);
  });
});

describe("listCatalogItems", () => {
  it("lists only the workspace's items, sorted by name", async () => {
    await createCatalogItem("org1", "u1", { kind: "product", name: "B", unit: "pcs", unitPrice: 1 });
    await createCatalogItem("org1", "u1", { kind: "work", name: "A", unit: "hour", unitPrice: 2 });
    await createCatalogItem("org2", "u1", { kind: "product", name: "C", unit: "pcs", unitPrice: 3 });

    const items = await listCatalogItems("org1");
    expect(items.map((i) => i.name)).toEqual(["A", "B"]);
  });
});

describe("update/delete", () => {
  it("patches fields and bumps updatedAt", async () => {
    const item = await createCatalogItem("org1", "u1", {
      kind: "product",
      name: "X",
      unit: "pcs",
      unitPrice: 1,
    });
    await updateCatalogItem("org1", item.id, { unitPrice: 9.99, name: "Y" });
    const stored = firestoreDocs.get(`workspaces/org1/catalogItems/${item.id}`) as {
      unitPrice: number;
      name: string;
      updatedAt: string;
    };
    expect(stored.unitPrice).toBe(9.99);
    expect(stored.name).toBe("Y");
    expect(stored.updatedAt >= item.updatedAt).toBe(true);
  });

  it("deletes the doc", async () => {
    const item = await createCatalogItem("org1", "u1", {
      kind: "work",
      name: "X",
      unit: "hour",
      unitPrice: 1,
    });
    await deleteCatalogItem("org1", item.id);
    expect(firestoreDocs.has(`workspaces/org1/catalogItems/${item.id}`)).toBe(false);
  });
});

describe("parseCatalogPrice", () => {
  it("handles decimal commas, currency suffixes and 'od' prefixes", () => {
    expect(parseCatalogPrice("1,45")).toBe(1.45);
    expect(parseCatalogPrice("8,6 €")).toBe(8.6);
    expect(parseCatalogPrice("od 11")).toBe(11);
    expect(parseCatalogPrice("17.5")).toBe(17.5);
    expect(parseCatalogPrice("abc")).toBeNaN();
  });
});

describe("normalizeCatalogUnit", () => {
  it("maps Slovak price-list units to canonical units", () => {
    expect(normalizeCatalogUnit("ks")).toBe("pcs");
    expect(normalizeCatalogUnit("bm")).toBe("m");
    expect(normalizeCatalogUnit("hod")).toBe("hour");
    expect(normalizeCatalogUnit("km")).toBe("km");
    expect(normalizeCatalogUnit("cm")).toBe("cm");
    expect(normalizeCatalogUnit("???")).toBe("other");
  });
});

describe("parseCatalogCsv", () => {
  it("parses a semicolon CSV with a Slovak header", () => {
    const csv = [
      "nazov;jednotka;cena;typ;popis",
      "Zásuvka 230V;ks;4,50;produkt;Biela",
      "Zapojenie zásuvky 2+PE;ks;3,5;praca;Kompletáž",
    ].join("\n");
    const { rows, errors } = parseCatalogCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Zásuvka 230V",
      unit: "pcs",
      price: 4.5,
      kind: "product",
      description: "Biela",
    });
    expect(rows[1]).toMatchObject({ kind: "work", price: 3.5 });
  });

  it("parses tab-separated data without a header (name/unit/price order)", () => {
    const tsv = [
      "sekanie drážky šírka 30mm - tehla\tbm\t1,9",
      "Základná hodinová sadzba\thod\t15",
    ].join("\n");
    const { rows, errors } = parseCatalogCsv(tsv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ unit: "m", price: 1.9 });
    expect(rows[1]).toMatchObject({ unit: "hour", price: 15 });
  });

  it("skips section-heading rows (name only) silently and reports bad prices", () => {
    const csv = [
      "Elektroinštalačné práce – kompletáž;;",
      "zapojenie tlačítka;ks;1,9",
      "pokazený riadok;ks;xx",
    ].join("\n");
    const { rows, errors } = parseCatalogCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("zapojenie tlačítka");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("xx");
  });

  it("returns nothing for an empty file", () => {
    expect(parseCatalogCsv("")).toEqual({ rows: [], errors: [] });
  });
});

describe("importParsedCatalogRows", () => {
  const parsedRows = parseCatalogCsv(
    ["Zásuvka 230V;ks;4,50", "Zapojenie zásuvky;ks;3,5", "Ťahanie kábla;bm;0,7"].join("\n")
  ).rows;

  it("creates items with the default kind and reports counts", async () => {
    const result = await importParsedCatalogRows("org1", "u1", parsedRows, "work");
    expect(result).toEqual({ created: 3, skipped: 0 });
    const items = await listCatalogItems("org1");
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.kind === "work")).toBe(true);
    expect(items.find((i) => i.name === "Ťahanie kábla")).toMatchObject({
      unit: "m",
      unitPrice: 0.7,
    });
  });

  it("re-import skips already existing names (no duplicates)", async () => {
    await importParsedCatalogRows("org1", "u1", parsedRows, "work");
    const again = await importParsedCatalogRows("org1", "u1", parsedRows, "work");
    expect(again).toEqual({ created: 0, skipped: 3 });
    expect(await listCatalogItems("org1")).toHaveLength(3);
  });

  it("keeps a user's manually created same-named item untouched", async () => {
    const mine = await createCatalogItem("org1", "u1", {
      kind: "work",
      name: "Zásuvka 230V",
      unit: "pcs",
      unitPrice: 9.99,
    });
    const result = await importParsedCatalogRows("org1", "u1", parsedRows, "work");
    expect(result.skipped).toBe(1);
    const items = await listCatalogItems("org1");
    const match = items.filter((i) => i.name === "Zásuvka 230V");
    expect(match).toHaveLength(1);
    expect(match[0]!.id).toBe(mine.id);
    expect(match[0]!.unitPrice).toBe(9.99);
  });

  it("skips duplicate names inside the same file", async () => {
    const rows = parseCatalogCsv(["Rovnaká položka;ks;1", "Rovnaká položka;ks;2"].join("\n")).rows;
    const result = await importParsedCatalogRows("org1", "u1", rows, "product");
    expect(result).toEqual({ created: 1, skipped: 1 });
  });
});

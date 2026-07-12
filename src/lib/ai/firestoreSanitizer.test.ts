import { describe, expect, it } from "vitest";
import {
  createEvidenceSource,
  sanitizeForFirestore,
} from "@/lib/firestoreSanitizer";
import {
  createEvidenceSource as createEvidenceSourceFn,
  sanitizeForFirestore as sanitizeForFirestoreFn,
} from "../../../functions/src/utils/firestoreSanitizer";
import { extractedItemDedupeKey } from "../../../functions/src/estimator/estimatorMerge";

describe("sanitizeForFirestore (client)", () => {
  it("removes undefined page from evidence", () => {
    const input = {
      evidence: [
        {
          fileName: "08_Znacenie_elektrika_2.pdf",
          page: undefined,
          inputType: "pdf",
        },
      ],
    };
    const out = sanitizeForFirestore(input);
    expect(out.evidence[0]).toEqual({
      fileName: "08_Znacenie_elektrika_2.pdf",
      inputType: "pdf",
    });
    expect("page" in out.evidence[0]!).toBe(false);
  });

  it("removes nested undefined from rooms, items and quote lines", () => {
    const out = sanitizeForFirestore({
      rooms: [
        {
          id: "r1",
          name: "KUCHYNA",
          code: undefined,
          evidence: [{ inputType: "pdf", page: undefined, fileName: "a.pdf" }],
        },
      ],
      extractedItems: [
        {
          id: "i1",
          title: "LED pás",
          quantity: undefined,
          unit: "m",
          reviewReason: undefined,
        },
      ],
      lines: [
        {
          id: "l1",
          title: "Montáž",
          unitPrice: undefined,
          quantity: 1,
        },
      ],
    });
    expect(out.rooms[0]).toEqual({
      id: "r1",
      name: "KUCHYNA",
      evidence: [{ inputType: "pdf", fileName: "a.pdf" }],
    });
    expect(out.extractedItems[0]).toEqual({
      id: "i1",
      title: "LED pás",
      unit: "m",
    });
    expect(out.lines[0]).toEqual({ id: "l1", title: "Montáž", quantity: 1 });
  });

  it("preserves 0, false, empty string and null", () => {
    const out = sanitizeForFirestore({
      qty: 0,
      flagged: false,
      note: "",
      missing: null,
    });
    expect(out).toEqual({ qty: 0, flagged: false, note: "", missing: null });
  });

  it("removes undefined array elements", () => {
    const out = sanitizeForFirestore({
      items: ["a", undefined, "b", undefined],
    });
    expect(out.items).toEqual(["a", "b"]);
  });

  it("produces Firestore-safe estimator facts without undefined", () => {
    const facts = sanitizeForFirestore({
      sessionId: "s1",
      rooms: [
        {
          id: "r0",
          name: "VSTUP",
          evidence: [
            {
              fileName: "08_Znacenie_elektrika_2.pdf",
              page: undefined,
              inputType: "pdf",
            },
          ],
        },
      ],
      extractedItems: [],
      diagnostics: { pageByPageFallbackReason: undefined, visionUsed: true },
    });

    // Simulate a mock setDoc that rejects undefined (like Firestore).
    const assertNoUndefined = (value: unknown, path = ""): void => {
      if (value === undefined) {
        throw new Error(`undefined at ${path || "root"}`);
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => assertNoUndefined(v, `${path}[${i}]`));
        return;
      }
      if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          assertNoUndefined(v, path ? `${path}.${k}` : k);
        }
      }
    };
    expect(() => assertNoUndefined(facts)).not.toThrow();
  });
});

describe("createEvidenceSource", () => {
  it("omits page when not a finite number", () => {
    const e = createEvidenceSource({
      fileName: "plan.pdf",
      page: undefined,
      inputType: "pdf",
    });
    expect(e).toEqual({ fileName: "plan.pdf", inputType: "pdf" });
    expect("page" in e).toBe(false);
  });

  it("includes page when finite", () => {
    expect(createEvidenceSource({ page: 2, inputType: "pdf" }).page).toBe(2);
  });
});

describe("sanitizeForFirestore (functions)", () => {
  it("matches client behavior for evidence.page", () => {
    const out = sanitizeForFirestoreFn({
      facts: {
        rooms: [
          {
            evidence: [{ fileName: "x.pdf", page: undefined, inputType: "pdf" }],
          },
        ],
      },
    });
    expect(out.facts.rooms[0]!.evidence[0]).toEqual({
      fileName: "x.pdf",
      inputType: "pdf",
    });
  });

  it("strips undefined areaM2 from projectFacts.rooms (classic draft crash)", () => {
    const out = sanitizeForFirestoreFn({
      draft: {
        projectFacts: {
          rooms: [
            { name: "Kuchyňa", areaM2: 12.5 },
            { name: "Chodba", areaM2: undefined },
            { name: "WC" },
          ],
          totalKnownAreaM2: undefined,
        },
      },
    });
    expect(out.draft.projectFacts.rooms[1]).toEqual({ name: "Chodba" });
    expect("areaM2" in out.draft.projectFacts.rooms[1]!).toBe(false);
    expect("totalKnownAreaM2" in out.draft.projectFacts).toBe(false);
  });

  it("preserves FieldValue-like non-plain objects", () => {
    class FieldValueSentinel {
      constructor(public readonly _methodName: string) {}
    }
    const sentinel = new FieldValueSentinel("serverTimestamp");
    const out = sanitizeForFirestoreFn({ createdAt: sentinel, name: "x" });
    expect(out.createdAt).toBe(sentinel);
  });
});

describe("createEvidenceSource (functions) + dedupe edge cases", () => {
  it("source page missing must not crash createEvidenceSource", () => {
    expect(() =>
      createEvidenceSourceFn({
        fileName: "plan.pdf",
        page: null,
        inputType: "pdf",
      })
    ).not.toThrow();
  });

  it("same LED item in different rooms stay separate", () => {
    const a = {
      id: "1",
      category: "led_strip" as const,
      roomName: "KUCHYNA",
      title: "LED pás v SDK",
      quantity: 4,
      unit: "m" as const,
      origin: "from_document" as const,
      evidence: [{ fileName: "plan.pdf", inputType: "pdf" as const }],
      confidence: "high" as const,
      needsReview: false,
    };
    const b = { ...a, id: "2", roomName: "SPALNA" };
    expect(extractedItemDedupeKey(a)).not.toBe(extractedItemDedupeKey(b));
  });

  it("same LED title with different length stays separate", () => {
    const a = {
      id: "1",
      category: "led_strip" as const,
      roomName: "KUCHYNA",
      title: "LED pás",
      quantity: 3.2,
      unit: "m" as const,
      origin: "from_document" as const,
      evidence: [{ fileName: "plan.pdf", inputType: "pdf" as const }],
      confidence: "high" as const,
      needsReview: false,
    };
    const b = { ...a, id: "2", quantity: 5.5 };
    expect(extractedItemDedupeKey(a)).not.toBe(extractedItemDedupeKey(b));
  });
});

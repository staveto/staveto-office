import { describe, expect, it } from "vitest";
import { mergeSnapshots } from "./businessProjectAssignmentService";

describe("mergeSnapshots", () => {
  it("never emits undefined field values (Firestore updateDoc rejects them)", () => {
    const merged = mergeSnapshots(
      [{ uid: "a", name: "Alica", role: undefined }],
      { uid: "b", name: "Jan Kováč", role: undefined }
    );
    for (const row of merged) {
      expect(Object.values(row)).not.toContain(undefined);
    }
    expect(merged).toEqual([
      { uid: "a", name: "Alica" },
      { uid: "b", name: "Jan Kováč" },
    ]);
  });

  it("replaces an existing member row instead of duplicating it", () => {
    const merged = mergeSnapshots(
      [
        { uid: "a", name: "Alica" },
        { uid: "b", name: "Old name" },
      ],
      { uid: "b", name: "Jan Kováč", role: "worker" }
    );
    expect(merged).toEqual([
      { uid: "a", name: "Alica" },
      { uid: "b", name: "Jan Kováč", role: "worker" },
    ]);
  });

  it("drops empty/whitespace names and roles", () => {
    const merged = mergeSnapshots([], { uid: "c", name: "  ", role: "" });
    expect(merged).toEqual([{ uid: "c" }]);
  });
});

import { describe, expect, it } from "vitest";
import {
  resolveQuoteTemplateLoadState,
  resolveQuoteTemplateMessageKind,
  resolveQuoteTemplateStatusBadge,
} from "./quoteTemplateLoadState";

describe("resolveQuoteTemplateStatusBadge", () => {
  it("shows loading while template fetch is in progress", () => {
    expect(
      resolveQuoteTemplateStatusBadge({
        loading: true,
        loadState: "loading",
        isDirty: false,
      })
    ).toBe("loading");
  });

  it("missing template does not show Saved status", () => {
    expect(
      resolveQuoteTemplateStatusBadge({
        loading: false,
        loadState: "missing",
        isDirty: false,
      })
    ).toBe("default_template");
  });

  it("successful load with no edits shows Saved", () => {
    expect(
      resolveQuoteTemplateStatusBadge({
        loading: false,
        loadState: "loaded",
        isDirty: false,
      })
    ).toBe("saved");
  });

  it("unsaved local edit shows Unsaved changes", () => {
    expect(
      resolveQuoteTemplateStatusBadge({
        loading: false,
        loadState: "loaded",
        isDirty: true,
      })
    ).toBe("unsaved_changes");
  });

  it("permission error does not show Saved status", () => {
    expect(
      resolveQuoteTemplateStatusBadge({
        loading: false,
        loadState: "permission",
        isDirty: false,
      })
    ).toBe("not_saved");
  });

  it("network error shows server issue badge", () => {
    expect(
      resolveQuoteTemplateStatusBadge({
        loading: false,
        loadState: "network",
        isDirty: false,
      })
    ).toBe("server_issue");
  });

  it("successful save state shows Saved when not dirty", () => {
    expect(
      resolveQuoteTemplateStatusBadge({
        loading: false,
        loadState: "loaded",
        isDirty: false,
      })
    ).toBe("saved");
  });
});

describe("resolveQuoteTemplateMessageKind", () => {
  it("missing template uses neutral info, not warning", () => {
    expect(resolveQuoteTemplateMessageKind("missing")).toBe("info");
  });

  it("permission error uses warning", () => {
    expect(resolveQuoteTemplateMessageKind("permission")).toBe("warning");
  });

  it("missing template load state is not permission/network", () => {
    expect(resolveQuoteTemplateLoadState({ loadState: "missing" })).toBe("missing");
  });
});

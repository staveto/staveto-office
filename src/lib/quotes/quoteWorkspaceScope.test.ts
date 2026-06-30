import { describe, expect, it } from "vitest";
import type { ActiveWorkspace } from "@/types/workspace";
import {
  countHiddenUnscopedQuotes,
  filterQuotesForActiveWorkspace,
  getActiveQuoteScope,
  quoteBelongsToActiveWorkspace,
} from "./quoteWorkspaceScope";

const companyWorkspace: ActiveWorkspace = {
  id: "orgA",
  type: "company",
  name: "Company A",
  role: "owner",
  source: "organization",
  orgId: "orgA",
};

const soloWorkspace: ActiveWorkspace = {
  id: "personal",
  type: "personal",
  name: "Personal",
  role: "owner",
  source: "personal",
  ownerId: "userA",
};

describe("getActiveQuoteScope", () => {
  it("returns null when workspace or user is missing", () => {
    expect(getActiveQuoteScope({ workspace: companyWorkspace, userId: null })).toBeNull();
    expect(getActiveQuoteScope({ workspace: null, userId: "userA" })).toBeNull();
  });
});

describe("quoteBelongsToActiveWorkspace", () => {
  const companyScope = getActiveQuoteScope({ workspace: companyWorkspace, userId: "userA" })!;
  const soloScope = getActiveQuoteScope({ workspace: soloWorkspace, userId: "userA" })!;

  it("company A scope sees only Company A quotes", () => {
    expect(
      quoteBelongsToActiveWorkspace({ orgId: "orgA", ownerId: "userA" }, companyScope)
    ).toBe(true);
    expect(
      quoteBelongsToActiveWorkspace({ orgId: "orgB", ownerId: "userA" }, companyScope)
    ).toBe(false);
    expect(
      quoteBelongsToActiveWorkspace({ ownerId: "userA", workspaceType: "personal" }, companyScope)
    ).toBe(false);
  });

  it("company scope never uses ownerUid fallback across orgs", () => {
    expect(
      quoteBelongsToActiveWorkspace({ ownerId: "userA", orgId: "orgB" }, companyScope)
    ).toBe(false);
  });

  it("solo scope sees only current user solo quotes", () => {
    expect(
      quoteBelongsToActiveWorkspace({ ownerId: "userA", workspaceType: "personal" }, soloScope)
    ).toBe(true);
    expect(
      quoteBelongsToActiveWorkspace({ ownerId: "userB", workspaceType: "personal" }, soloScope)
    ).toBe(false);
    expect(
      quoteBelongsToActiveWorkspace({ ownerId: "userA", orgId: "orgA" }, soloScope)
    ).toBe(false);
  });

  it("hides unscoped quotes", () => {
    expect(quoteBelongsToActiveWorkspace({}, companyScope)).toBe(false);
    expect(quoteBelongsToActiveWorkspace({}, soloScope)).toBe(false);
    expect(countHiddenUnscopedQuotes([{}, { orgId: "orgA" }])).toBe(1);
  });

  it("preferredLanguage and country do not affect visibility", () => {
    const quote = {
      orgId: "orgA",
      ownerId: "userA",
      preferredLanguage: "sk",
      countryCode: "CH",
    } as Record<string, string>;
    expect(quoteBelongsToActiveWorkspace(quote, companyScope)).toBe(true);
  });

  it("filterQuotesForActiveWorkspace returns empty when scope missing", () => {
    expect(filterQuotesForActiveWorkspace([{ orgId: "orgA" }], null)).toEqual([]);
  });
});

describe("project is not a quote", () => {
  it("project draft status alone is not a quote document", () => {
    const companyScope = getActiveQuoteScope({ workspace: companyWorkspace, userId: "userA" })!;
    expect(quoteBelongsToActiveWorkspace({}, companyScope)).toBe(false);
  });
});

describe("open quote from project validates scope", () => {
  it("linked quote orgB is hidden in orgA company workspace", () => {
    const companyScope = getActiveQuoteScope({ workspace: companyWorkspace, userId: "userA" })!;
    expect(
      quoteBelongsToActiveWorkspace({ orgId: "orgB", ownerId: "userA" }, companyScope)
    ).toBe(false);
  });
});

describe("no global query fallback", () => {
  it("missing scope yields no visible quotes", () => {
    expect(filterQuotesForActiveWorkspace([{ orgId: "orgA" }, { orgId: "orgB" }], null)).toEqual(
      []
    );
  });
});

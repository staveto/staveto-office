import { describe, expect, it } from "vitest";
import type { ActiveWorkspace } from "@/types/workspace";
import {
  evaluateCompanyCreationGuard,
  findMatchingCompanyCandidates,
} from "./companyIdentityGuard";
import {
  normalizeCompanyIdentityName,
  isSoloWorkspaceId,
  SOLO_WORKSPACE_ID,
} from "./workspaceContract";
import type { OrgReviewSnapshot } from "./workspaceDuplicateReview";
import { applyDuplicateSuppression } from "./workspaceDuplicateSuppression";

function snapshot(partial: Partial<OrgReviewSnapshot> & { orgId: string }): OrgReviewSnapshot {
  return {
    orgId: partial.orgId,
    name: partial.name ?? "Staveto s.r.o.",
    legalName: partial.legalName ?? "Staveto s.r.o.",
    ownerUid: partial.ownerUid ?? "user-1",
    createdAt: partial.createdAt ?? null,
    source: partial.source ?? "web_onboarding",
    country: partial.country ?? "SK",
    membersCount: partial.membersCount ?? 1,
    projectsCount: partial.projectsCount ?? 0,
    profileFieldCount: partial.profileFieldCount ?? 1,
    isOwner: partial.isOwner ?? true,
    isMember: partial.isMember ?? true,
    membershipRole: partial.membershipRole ?? "owner",
    matchesLastActiveWorkspace: partial.matchesLastActiveWorkspace ?? false,
    matchesActiveBusinessOrg: partial.matchesActiveBusinessOrg ?? false,
  };
}

describe("normalizeCompanyIdentityName", () => {
  it("treats punctuation variants as the same identity", () => {
    const a = normalizeCompanyIdentityName("Staveto s.r.o.");
    const b = normalizeCompanyIdentityName("Staveto sro");
    const c = normalizeCompanyIdentityName("STAVETO, s.r.o.");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe("applyDuplicateSuppression", () => {
  const workspaces: ActiveWorkspace[] = [
    {
      id: "TiFk7B-empty",
      type: "company",
      name: "Staveto s.r.o.",
      role: "owner",
      source: "organization",
      orgId: "TiFk7B-empty",
      legacyId: "TiFk7B-empty",
    },
    {
      id: "Z-canonical",
      type: "company",
      name: "Staveto s.r.o.",
      role: "owner",
      source: "organization",
      orgId: "Z-canonical",
      legacyId: "Z-canonical",
    },
  ];

  it("hides 0-project duplicate and keeps 9-project org in switcher", () => {
    const snapshots = [
      snapshot({ orgId: "TiFk7B-empty", projectsCount: 0 }),
      snapshot({ orgId: "Z-canonical", projectsCount: 9 }),
    ];
    const result = applyDuplicateSuppression(workspaces, snapshots, "user-1");
    expect(result.switcherWorkspaces.map((w) => w.orgId)).toEqual(["Z-canonical"]);
    expect(result.hiddenDuplicates).toHaveLength(1);
    expect(result.hiddenDuplicates[0].orgId).toBe("TiFk7B-empty");
    expect(result.hiddenDuplicates[0].canonicalOrgId).toBe("Z-canonical");
  });

  it("keeps both orgs when names differ", () => {
    const mixedWorkspaces: ActiveWorkspace[] = [
      { ...workspaces[0], id: "org-a", orgId: "org-a", name: "Alpha s.r.o." },
      { ...workspaces[1], id: "org-b", orgId: "org-b", name: "Beta s.r.o." },
    ];
    const snapshots = [
      snapshot({ orgId: "org-a", name: "Alpha s.r.o.", legalName: "Alpha s.r.o." }),
      snapshot({ orgId: "org-b", name: "Beta s.r.o.", legalName: "Beta s.r.o." }),
    ];
    const result = applyDuplicateSuppression(mixedWorkspaces, snapshots, "user-1");
    expect(result.switcherWorkspaces.filter((w) => w.type === "company")).toHaveLength(2);
    expect(result.hiddenDuplicates).toHaveLength(0);
  });

  it("remaps lastActiveWorkspaceId from hidden duplicate to canonical", () => {
    const snapshots = [
      snapshot({ orgId: "TiFk7B-empty", projectsCount: 0 }),
      snapshot({ orgId: "Z-canonical", projectsCount: 9 }),
    ];
    const result = applyDuplicateSuppression(workspaces, snapshots, "user-1");
    expect(result.remapOrgId("TiFk7B-empty")).toBe("Z-canonical");
    expect(result.remapOrgId("Z-canonical")).toBe("Z-canonical");
  });
});

describe("evaluateCompanyCreationGuard", () => {
  it("prefers 9-project org over 0-project duplicate for Staveto s.r.o.", () => {
    const guard = evaluateCompanyCreationGuard(
      "Staveto s.r.o.",
      [
        { orgId: "Z-canonical", name: "Staveto s.r.o.", legalName: "Staveto s.r.o.", projectsCount: 9 },
        { orgId: "TiFk7B-empty", name: "Staveto s.r.o.", projectsCount: 0 },
      ],
      { userId: "user-1" }
    );
    expect(guard.action).toBe("use_existing");
    if (guard.action === "use_existing") {
      expect(guard.orgId).toBe("Z-canonical");
    }
  });

  it("blocks creating another org when same identity exists", () => {
    const guard = evaluateCompanyCreationGuard(
      "Staveto s.r.o.",
      [
        { orgId: "Z-canonical", name: "Staveto s.r.o.", legalName: "Staveto s.r.o.", projectsCount: 9 },
        { orgId: "TiFk7B-empty", name: "Staveto s.r.o.", projectsCount: 0 },
      ],
      { userId: "user-1" }
    );
    expect(guard.action).not.toBe("create_allowed");
  });

  it("returns manual_review_required when multiple data-rich duplicates tie", () => {
    const guard = evaluateCompanyCreationGuard(
      "Staveto s.r.o.",
      [
        {
          orgId: "org-a",
          name: "Staveto s.r.o.",
          legalName: "Staveto s.r.o.",
          projectsCount: 9,
          membersCount: 3,
          profileFieldCount: 4,
        },
        {
          orgId: "org-b",
          name: "Staveto s.r.o.",
          legalName: "Staveto s.r.o.",
          projectsCount: 9,
          membersCount: 3,
          profileFieldCount: 4,
        },
      ],
      { userId: "user-1" }
    );
    expect(guard.action).toBe("manual_review_required");
  });

  it("allows creation when no identity match", () => {
    const guard = evaluateCompanyCreationGuard("New Company s.r.o.", [
      { orgId: "other", name: "Different s.r.o." },
    ]);
    expect(guard.action).toBe("create_allowed");
  });
});

describe("isSoloWorkspaceId", () => {
  it("recognizes canonical solo id", () => {
    expect(isSoloWorkspaceId(SOLO_WORKSPACE_ID)).toBe(true);
    expect(isSoloWorkspaceId("org-123")).toBe(false);
  });
});

describe("findMatchingCompanyCandidates", () => {
  it("matches legalName variants", () => {
    const matches = findMatchingCompanyCandidates(
      "STAVETO, s.r.o.",
      [{ orgId: "x", name: "Staveto sro", legalName: "Staveto s.r.o." }]
    );
    expect(matches).toHaveLength(1);
  });
});

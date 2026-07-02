"use client";

import { useEffect } from "react";
import {
  useOptionalManagerAgentScreenData,
  type ManagerAgentScreenData,
} from "@/context/ManagerAgentContext";
import type { DashboardStats } from "@/lib/dashboardStats";
import type { ProjectDoc } from "@/lib/projects";

function useAgentScreenDataSync(
  enabled: boolean,
  buildPatch: () => Partial<ManagerAgentScreenData>,
  deps: unknown[]
) {
  const ctx = useOptionalManagerAgentScreenData();
  const patchScreenData = ctx?.patchScreenData;
  const clearScreenData = ctx?.clearScreenData;

  useEffect(() => {
    if (!patchScreenData || !enabled) return;
    patchScreenData(buildPatch());
    // buildPatch is intentionally omitted; caller supplies primitive deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, patchScreenData, ...deps]);

  useEffect(() => {
    if (!clearScreenData) return;
    return () => clearScreenData();
  }, [clearScreenData]);
}

export function useDashboardAgentScreenSync(stats: DashboardStats | null) {
  useAgentScreenDataSync(
    stats != null,
    () => ({
      activeProjectCount: stats?.activeJobsCount ?? undefined,
      openQuoteCount: stats?.quotesAwaitingCount ?? undefined,
      delayedJobCount: stats?.delayedJobsCount ?? undefined,
    }),
    [stats?.activeJobsCount, stats?.delayedJobsCount, stats?.quotesAwaitingCount]
  );
}

export function useProjectsAgentScreenSync(visibleProjectCount: number | null) {
  useAgentScreenDataSync(
    visibleProjectCount != null,
    () => ({ visibleProjectCount: visibleProjectCount ?? undefined }),
    [visibleProjectCount]
  );
}

export function useQuotesAgentScreenSync(visibleQuoteCount: number | null) {
  useAgentScreenDataSync(
    visibleQuoteCount != null,
    () => ({ visibleQuoteCount: visibleQuoteCount ?? undefined }),
    [visibleQuoteCount]
  );
}

export function useProjectDetailAgentScreenSync(input: {
  project: ProjectDoc | null;
  taskCount?: number;
  assignedMemberCount?: number;
  unsavedChanges?: boolean;
}) {
  const { project, taskCount, assignedMemberCount, unsavedChanges } = input;

  useAgentScreenDataSync(
    project != null,
    () => {
      if (!project) return {};
      const location = project.addressText?.trim() || project.city?.trim() || "";
      return {
        visibleEntityType: "project",
        visibleEntityId: project.id,
        visibleEntitySummary: project.name ?? null,
        projectName: project.name ?? null,
        projectStatus: project.phase ?? project.lifecycleStatus ?? null,
        hasTasks: taskCount != null ? taskCount > 0 : undefined,
        hasLocation: Boolean(location),
        hasAssignedMembers:
          assignedMemberCount != null
            ? assignedMemberCount > 0
            : Array.isArray(project.assignedMemberIds)
              ? project.assignedMemberIds.length > 0
              : undefined,
        hasAttachments:
          (Array.isArray(project.attachedFileIds) && project.attachedFileIds.length > 0) ||
          (Array.isArray(project.aiWizardAttachmentPaths) &&
            project.aiWizardAttachmentPaths.length > 0),
        unsavedChanges: unsavedChanges ?? false,
      };
    },
    [assignedMemberCount, project, taskCount, unsavedChanges]
  );
}

export function useQuoteDetailAgentScreenSync(input: {
  quoteId: string;
  title: string;
  status: string;
  clientEmail: string;
  currency?: string | null;
  projectId?: string;
  projectTaskCount?: number;
  unsavedChanges?: boolean;
}) {
  useAgentScreenDataSync(
    true,
    () => ({
      visibleEntityType: "quote",
      visibleEntityId: input.quoteId,
      visibleEntitySummary: input.title || null,
      quoteTitle: input.title || null,
      quoteStatus: input.status,
      quoteAccepted: input.status === "accepted",
      quoteCurrency: input.currency ?? null,
      customerEmailMissing: !input.clientEmail.trim(),
      linkedProjectId: input.projectId ?? null,
      projectTaskCount: input.projectTaskCount,
      unsavedChanges: input.unsavedChanges ?? false,
    }),
    [
      input.clientEmail,
      input.currency,
      input.projectId,
      input.projectTaskCount,
      input.quoteId,
      input.status,
      input.title,
      input.unsavedChanges,
    ]
  );
}

export function useCompanySettingsAgentScreenSync(input: {
  legalName?: string | null;
  logoUrl?: string | null;
  vatId?: string | null;
  registeredCountry?: string | null;
  bankAccount?: string | null;
}) {
  useAgentScreenDataSync(
    true,
    () => ({
      legalNameMissing: !input.legalName?.trim(),
      logoMissing: !input.logoUrl?.trim(),
      vatIdMissing: !input.vatId?.trim(),
      registeredCountryMissing: !input.registeredCountry?.trim(),
      bankAccountMissing: !input.bankAccount?.trim(),
    }),
    [
      input.bankAccount,
      input.legalName,
      input.logoUrl,
      input.registeredCountry,
      input.vatId,
    ]
  );
}

export function useNewProjectWizardAgentScreenSync(input: {
  projectName?: string;
  briefLength?: number;
  hasAttachments?: boolean;
  locationMissing?: boolean;
  wizardStep?: string | null;
}) {
  useAgentScreenDataSync(
    true,
    () => ({
      projectNameMissing: !input.projectName?.trim(),
      briefLength: input.briefLength,
      hasAttachments: input.hasAttachments,
      locationMissing: input.locationMissing,
      wizardStep: input.wizardStep ?? null,
    }),
    [
      input.briefLength,
      input.hasAttachments,
      input.locationMissing,
      input.projectName,
      input.wizardStep,
    ]
  );
}

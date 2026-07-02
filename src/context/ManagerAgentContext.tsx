"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AgentSuggestedAction } from "@/lib/agent/managerAgentContract";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useActiveWorkspaceContext } from "@/hooks/useActiveWorkspaceContext";
import {
  buildCompanySettingsAgentContext,
  buildDashboardAgentContext,
  buildNewProjectWizardAgentContext,
  buildProjectDetailAgentContext,
  buildProjectsAgentContext,
  buildQuoteDetailAgentContext,
  buildQuoteSettingsAgentContext,
  buildQuotesAgentContext,
  buildUnknownAgentContext,
  detectManagerScreenType,
  extractEntityIdFromRoute,
  type ManagerScreenContext,
  type ManagerScreenType,
} from "@/lib/agent/managerScreenContext";

export type ManagerAgentScreenData = {
  visibleEntitySummary?: string | null;
  visibleEntityType?: string | null;
  visibleEntityId?: string | null;
  missingFields?: string[];
  warnings?: string[];
  unsavedChanges?: boolean;
  activeProjectCount?: number;
  openQuoteCount?: number;
  delayedJobCount?: number;
  visibleProjectCount?: number;
  visibleQuoteCount?: number;
  projectName?: string | null;
  projectStatus?: string | null;
  hasTasks?: boolean;
  hasLocation?: boolean;
  hasAssignedMembers?: boolean;
  hasAttachments?: boolean;
  quoteTitle?: string | null;
  quoteStatus?: string | null;
  quoteAccepted?: boolean;
  quoteCurrency?: string | null;
  customerEmailMissing?: boolean;
  projectTaskCount?: number;
  linkedProjectId?: string | null;
  legalNameMissing?: boolean;
  logoMissing?: boolean;
  vatIdMissing?: boolean;
  registeredCountryMissing?: boolean;
  bankAccountMissing?: boolean;
  briefLength?: number;
  locationMissing?: boolean;
  projectNameMissing?: boolean;
  wizardStep?: string | null;
};

export type ManagerAgentActionHandler = (
  action: AgentSuggestedAction
) => void | Promise<void>;

type ManagerAgentActionHandlersContextValue = {
  registerHandler: (handler: ManagerAgentActionHandler) => () => void;
  dispatchAction: (action: AgentSuggestedAction) => Promise<boolean>;
};

const ManagerAgentActionHandlersContext =
  createContext<ManagerAgentActionHandlersContextValue | null>(null);

export function ManagerAgentActionHandlersProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<ManagerAgentActionHandler | null>(null);

  const registerHandler = useCallback((handler: ManagerAgentActionHandler) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null;
      }
    };
  }, []);

  const dispatchAction = useCallback(async (action: AgentSuggestedAction) => {
    const handler = handlerRef.current;
    if (!handler) return false;
    await handler(action);
    return true;
  }, []);

  const value = useMemo(
    () => ({ registerHandler, dispatchAction }),
    [dispatchAction, registerHandler]
  );

  return (
    <ManagerAgentActionHandlersContext.Provider value={value}>
      {children}
    </ManagerAgentActionHandlersContext.Provider>
  );
}

export function useOptionalManagerAgentActionHandlers() {
  return useContext(ManagerAgentActionHandlersContext);
}

export function useRegisterManagerAgentActionHandler(
  handler: ManagerAgentActionHandler | null,
  enabled = true
) {
  const ctx = useOptionalManagerAgentActionHandlers();

  useEffect(() => {
    if (!ctx || !enabled || !handler) return;
    return ctx.registerHandler(handler);
  }, [ctx, enabled, handler]);
}

type ManagerAgentScreenDataContextValue = {
  screenData: ManagerAgentScreenData;
  setScreenData: (patch: ManagerAgentScreenData) => void;
  patchScreenData: (patch: Partial<ManagerAgentScreenData>) => void;
  clearScreenData: () => void;
};

export const ManagerAgentScreenDataContext =
  createContext<ManagerAgentScreenDataContextValue | null>(null);

export function ManagerAgentScreenDataProvider({ children }: { children: ReactNode }) {
  const [screenData, setScreenDataState] = useState<ManagerAgentScreenData>({});

  const setScreenData = useCallback((patch: ManagerAgentScreenData) => {
    setScreenDataState(patch);
  }, []);

  const patchScreenData = useCallback((patch: Partial<ManagerAgentScreenData>) => {
    setScreenDataState((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearScreenData = useCallback(() => {
    setScreenDataState({});
  }, []);

  const value = useMemo(
    () => ({ screenData, setScreenData, patchScreenData, clearScreenData }),
    [screenData, setScreenData, patchScreenData, clearScreenData]
  );

  return (
    <ManagerAgentScreenDataContext.Provider value={value}>
      {children}
    </ManagerAgentScreenDataContext.Provider>
  );
}

export function useManagerAgentScreenData() {
  const ctx = useContext(ManagerAgentScreenDataContext);
  if (!ctx) {
    throw new Error("useManagerAgentScreenData must be used within ManagerAgentScreenDataProvider");
  }
  return ctx;
}

export function useOptionalManagerAgentScreenData() {
  return useContext(ManagerAgentScreenDataContext);
}

type BuilderBase = Parameters<typeof buildDashboardAgentContext>[0];

function buildScreenContext(
  screenType: ManagerScreenType,
  entityId: string | null,
  base: BuilderBase,
  data: ManagerAgentScreenData
): ManagerScreenContext | null {
  switch (screenType) {
    case "dashboard":
      return buildDashboardAgentContext({
        ...base,
        activeProjectCount: data.activeProjectCount,
        openQuoteCount: data.openQuoteCount,
        delayedJobCount: data.delayedJobCount,
      });
    case "projects":
      return buildProjectsAgentContext({
        ...base,
        visibleProjectCount: data.visibleProjectCount,
      });
    case "project_detail":
      return entityId
        ? buildProjectDetailAgentContext({
            ...base,
            projectId: entityId,
            projectName: data.projectName,
            projectStatus: data.projectStatus,
            hasTasks: data.hasTasks,
            hasLocation: data.hasLocation,
            hasAssignedMembers: data.hasAssignedMembers,
            hasAttachments: data.hasAttachments,
            unsavedChanges: data.unsavedChanges,
          })
        : null;
    case "quotes":
      return buildQuotesAgentContext({
        ...base,
        visibleQuoteCount: data.visibleQuoteCount,
      });
    case "quote_detail":
      return entityId
        ? buildQuoteDetailAgentContext({
            ...base,
            quoteId: entityId,
            quoteTitle: data.quoteTitle,
            quoteStatus: data.quoteStatus,
            quoteAccepted: data.quoteAccepted,
            quoteCurrency: data.quoteCurrency,
            customerEmailMissing: data.customerEmailMissing,
            projectTaskCount: data.projectTaskCount,
            linkedProjectId: data.linkedProjectId,
            unsavedChanges: data.unsavedChanges,
          })
        : null;
    case "company_settings":
      return buildCompanySettingsAgentContext({
        ...base,
        legalNameMissing: data.legalNameMissing,
        logoMissing: data.logoMissing,
        vatIdMissing: data.vatIdMissing,
        registeredCountryMissing: data.registeredCountryMissing,
        bankAccountMissing: data.bankAccountMissing,
      });
    case "quote_settings":
      return buildQuoteSettingsAgentContext(base);
    case "new_project_wizard":
      return buildNewProjectWizardAgentContext({
        ...base,
        briefLength: data.briefLength,
        hasAttachments: data.hasAttachments,
        locationMissing: data.locationMissing,
        projectNameMissing: data.projectNameMissing,
        wizardStep: data.wizardStep,
      });
    default:
      return buildUnknownAgentContext(base);
  }
}

export function useManagerScreenContext(): ManagerScreenContext | null {
  const pathname = usePathname() ?? "";
  const { user, profile } = useAuth();
  const { workspaceRole } = useWorkspace();
  const workspaceCtx = useActiveWorkspaceContext();
  const screenDataCtx = useContext(ManagerAgentScreenDataContext);
  const screenData = screenDataCtx?.screenData ?? {};

  const screenType = detectManagerScreenType(pathname);
  const entityId = extractEntityIdFromRoute(pathname, screenType);

  return useMemo(() => {
    const base: BuilderBase = {
      route: pathname,
      userId: user?.id ?? null,
      workspaceCtx,
      userRole: workspaceRole,
      userPreferredLanguage: profile?.preferredLanguage ?? null,
    };

    const ctx = buildScreenContext(screenType, entityId, base, screenData);
    if (!ctx) return null;

    return {
      ...ctx,
      visibleEntitySummary: screenData.visibleEntitySummary ?? ctx.visibleEntitySummary,
      visibleEntityType: screenData.visibleEntityType ?? ctx.visibleEntityType,
      visibleEntityId: screenData.visibleEntityId ?? ctx.visibleEntityId,
      missingFields: [
        ...new Set([...(ctx.missingFields ?? []), ...(screenData.missingFields ?? [])]),
      ],
      warnings: [...new Set([...(ctx.warnings ?? []), ...(screenData.warnings ?? [])])],
      unsavedChanges: screenData.unsavedChanges ?? ctx.unsavedChanges,
    };
  }, [
    entityId,
    pathname,
    profile?.preferredLanguage,
    screenData,
    screenType,
    user?.id,
    workspaceCtx,
    workspaceRole,
  ]);
}

export function managerScreenTypeLabelKey(screenType: ManagerScreenType): string {
  return `agent.screen.${screenType}`;
}

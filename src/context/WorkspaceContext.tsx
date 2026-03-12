"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { Workspace, WorkspaceMember } from "@/lib/workspace-types";
import { useAuth } from "@/context/AuthContext";
import { getUserOrgMemberships } from "@/lib/organizations";

type WorkspaceContextValue = {
  activeWorkspace: Workspace | null;
  memberRole: WorkspaceMember["role"] | null;
  setActiveWorkspace: (ws: Workspace | null) => void;
  workspaces: Workspace[];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const PERSONAL_WORKSPACE: Workspace = {
  id: "personal",
  name: "Personal",
  type: "personal",
};

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([PERSONAL_WORKSPACE]);
  const [rolesMap, setRolesMap] = useState<Record<string, WorkspaceMember["role"]>>({});
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(PERSONAL_WORKSPACE);

  useEffect(() => {
    if (!user?.id) {
      setWorkspaces([PERSONAL_WORKSPACE]);
      setActiveWorkspaceState(PERSONAL_WORKSPACE);
      setRolesMap({});
      return;
    }
    getUserOrgMemberships(user.id).then((memberships) => {
      const teamWorkspaces: Workspace[] = memberships.map((m) => ({
        id: m.orgId,
        name: m.orgName,
        type: "team" as const,
      }));
      const roles: Record<string, WorkspaceMember["role"]> = {};
      for (const m of memberships) {
        roles[m.orgId] = m.role;
      }
      setRolesMap(roles);
      setWorkspaces([PERSONAL_WORKSPACE, ...teamWorkspaces]);
      setActiveWorkspaceState((current) => {
        if (!current) return PERSONAL_WORKSPACE;
        if (current.type === "personal") return PERSONAL_WORKSPACE;
        const found = teamWorkspaces.find((w) => w.id === current.id);
        return found ?? PERSONAL_WORKSPACE;
      });
    });
  }, [user?.id]);

  const memberRole =
    activeWorkspace?.type === "team" && activeWorkspace?.id
      ? rolesMap[activeWorkspace.id] ?? "member"
      : "member";

  const setActiveWorkspace = useCallback((ws: Workspace | null) => {
    setActiveWorkspaceState(ws);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
        memberRole,
        setActiveWorkspace,
        workspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

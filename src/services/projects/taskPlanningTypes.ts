/** Task tool snapshot stored on task doc (mobile-compatible). */
export type TaskToolSnapshot = {
  id: string;
  name: string;
  type?: string | null;
  qrCode?: string | null;
};

export type ProjectMemberRecord = {
  id: string;
  userId: string;
  name?: string;
  email?: string;
  role?: "owner" | "member";
  status?: "active" | "invited" | "removed";
  permissionLevel?: "viewer" | "editor";
  sharedItems?: {
    tasks?: boolean;
    phases?: boolean;
    expenses?: boolean;
    diary?: boolean;
    documents?: boolean;
    timeTracking?: boolean;
  };
};

export type ProjectPhaseRecord = {
  id: string;
  name: string;
  description?: string;
  order: number;
};

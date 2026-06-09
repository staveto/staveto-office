"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nContext";
import type { ProjectDoc } from "@/lib/projects";
import { getProject } from "@/lib/projects";
import {
  isDraftJob,
  isProjectArchived,
  normalizeProjectPhase,
} from "@/lib/projectLifecycle";
import type { WorkspaceRole } from "@/types/workspace";
import {
  archiveProject,
  unarchiveProject,
  deleteProject,
  updateProjectBasics,
  markProjectCompleted,
  markProjectPaused,
  rejectProjectConcept,
  convertDraftToActiveProject,
  canDeleteProject,
  canArchiveProject,
  canManageProjectLifecycle,
} from "@/services/projects";
import { Loader2, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectActionToastKey =
  | "projects.toast.archived"
  | "projects.toast.unarchived"
  | "projects.toast.deleted"
  | "projects.toast.updated"
  | "projects.toast.completed"
  | "projects.toast.rejected";

type ProjectActionsMenuProps = {
  project: ProjectDoc;
  userId: string;
  role?: WorkspaceRole;
  variant?: "list" | "detail";
  onProjectUpdated?: (project: ProjectDoc) => void;
  onActionComplete?: (toastKey: ProjectActionToastKey) => void;
  onRefresh?: () => void;
};

type ConfirmKind = "delete" | "archive" | null;

export function ProjectActionsMenu({
  project,
  userId,
  role,
  variant = "list",
  onProjectUpdated,
  onActionComplete,
  onRefresh,
}: ProjectActionsMenuProps) {
  const { t } = useI18n();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editName, setEditName] = useState(project.name ?? "");
  const [editAddress, setEditAddress] = useState(project.addressText ?? "");
  const [editCity, setEditCity] = useState(project.city ?? "");

  const archived = isProjectArchived(project);
  const draft = isDraftJob(project);
  const delivery = normalizeProjectPhase(project) === "delivery";
  const canManage = canManageProjectLifecycle(project, userId, role);
  const canArchive = canArchiveProject(project, userId, role);
  const canDelete = canDeleteProject(project, userId, role);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "PERMISSION_DENIED") {
      setError(t("projects.errors.permissionDenied"));
    } else {
      setError(msg);
    }
  };

  const reloadProject = async () => {
    const updated = await getProject(project.id);
    if (updated) onProjectUpdated?.(updated);
    onRefresh?.();
  };

  const runAction = async (
    fn: () => Promise<void>,
    toastKey: ProjectActionToastKey,
    opts?: { redirectAfter?: boolean; skipReload?: boolean }
  ) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMenuOpen(false);
      setConfirmKind(null);
      setEditOpen(false);
      if (opts?.redirectAfter) {
        onActionComplete?.(toastKey);
        router.push("/app/projects");
        return;
      }
      if (!opts?.skipReload) {
        await reloadProject();
      }
      onActionComplete?.(toastKey);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = () => {
    setEditName(project.name ?? "");
    setEditAddress(project.addressText ?? "");
    setEditCity(project.city ?? "");
    setEditOpen(true);
    setMenuOpen(false);
  };

  const menuItemClass =
    "w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-md disabled:opacity-50 disabled:pointer-events-none";

  return (
    <div className="relative" ref={menuRef}>
      <Button
        type="button"
        variant={variant === "detail" ? "outline" : "ghost"}
        size="sm"
        className={cn(variant === "list" && "h-8 w-8 p-0")}
        aria-label={t("projects.actions.menu")}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <MoreVertical className="size-4" />
        {variant === "detail" ? (
          <span className="ml-2 hidden sm:inline">{t("projects.actions.menu")}</span>
        ) : null}
      </Button>

      {menuOpen ? (
        <div
          className="absolute right-0 z-50 mt-1 min-w-[12rem] rounded-lg border border-border bg-background p-1 shadow-md"
          role="menu"
        >
          <button type="button" className={menuItemClass} onClick={openEdit}>
            {t("projects.actions.edit")}
          </button>

          {canArchive ? (
            archived ? (
              <button
                type="button"
                className={menuItemClass}
                disabled={busy}
                onClick={() =>
                  void runAction(() => unarchiveProject(project.id), "projects.toast.unarchived")
                }
              >
                {t("projects.actions.unarchive")}
              </button>
            ) : (
              <button
                type="button"
                className={menuItemClass}
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmKind("archive");
                }}
              >
                {t("projects.actions.archive")}
              </button>
            )
          ) : null}

          {canManage && draft ? (
            <button
              type="button"
              className={menuItemClass}
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => rejectProjectConcept(project.id).then(() => undefined),
                  "projects.toast.rejected"
                )
              }
            >
              {t("projects.actions.rejectConcept")}
            </button>
          ) : null}

          {canManage && draft ? (
            <button
              type="button"
              className={menuItemClass}
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => convertDraftToActiveProject(project.id, userId).then(() => undefined),
                  "projects.toast.updated"
                )
              }
            >
              {t("projects.draft.convert")}
            </button>
          ) : null}

          {canManage && delivery && !archived ? (
            <button
              type="button"
              className={menuItemClass}
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => markProjectCompleted(project.id),
                  "projects.toast.completed"
                )
              }
            >
              {t("projects.actions.markCompleted")}
            </button>
          ) : null}

          {canManage && delivery && variant === "detail" && !archived ? (
            <button
              type="button"
              className={menuItemClass}
              disabled={busy}
              onClick={() =>
                void runAction(() => markProjectPaused(project.id), "projects.toast.updated")
              }
            >
              {t("projects.actions.markPaused")}
            </button>
          ) : null}

          {canDelete ? (
            <button
              type="button"
              className={cn(menuItemClass, "text-destructive hover:bg-destructive/10")}
              disabled={busy}
              onClick={() => {
                setMenuOpen(false);
                setConfirmKind("delete");
              }}
            >
              {t("projects.actions.delete")}
            </button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("projects.actions.edit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">{t("projects.nameCol")}</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("projects.addressCol")}</label>
              <Input
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("projects.editCity")}</label>
              <Input
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                className="mt-1"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy || !editName.trim()}
              onClick={() =>
                void runAction(
                  () =>
                    updateProjectBasics(project.id, {
                      name: editName,
                      addressText: editAddress,
                      city: editCity,
                    }),
                  "projects.toast.updated"
                )
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmKind === "delete"}
        onOpenChange={(open) => !open && setConfirmKind(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("projects.deleteConfirm.title")}</DialogTitle>
            <DialogDescription>{t("projects.deleteConfirm.body")}</DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmKind(null)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => deleteProject(project.id),
                  "projects.toast.deleted",
                  {
                    redirectAfter: variant === "detail",
                    skipReload: variant === "list",
                  }
                )
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : t("projects.actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmKind === "archive"}
        onOpenChange={(open) => !open && setConfirmKind(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("projects.archiveConfirm.title")}</DialogTitle>
            <DialogDescription>{t("projects.archiveConfirm.body")}</DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmKind(null)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void runAction(() => archiveProject(project.id), "projects.toast.archived")
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : t("projects.actions.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Check, User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { useCompanyBranding } from "@/hooks/useCompanyBranding";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { CompanyLogo } from "@/components/branding/CompanyLogo";
import { getCompanyInitials } from "@/lib/userDisplay";
import type { ActiveWorkspace } from "@/types/workspace";

type ActiveCompanyContextSelectorProps = {
  /** Header pill (default) or full-width block inside mobile drawer. */
  variant?: "header" | "drawer";
};

export function ActiveCompanyContextSelector({
  variant = "header",
}: ActiveCompanyContextSelectorProps) {
  const { activeWorkspace, availableWorkspaces, setActiveWorkspace } =
    useWorkspace();
  const { t } = useI18n();
  const { logoUrl, displayName } = useCompanyBranding();
  const { canManage } = useWorkspaceProduct();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const companies = availableWorkspaces.filter((w) => w.type === "company");
  const personalWorkspace = availableWorkspaces.find(
    (w) => w.type === "personal"
  );
  const hasPersonal = !!personalWorkspace;
  const hasCompanies = companies.length > 0;
  const hasMultipleCompanies = companies.length > 1;
  const isPersonalActive = activeWorkspace?.type === "personal";
  /** Switching only matters when at least one company exists (personal is always available). */
  const showDropdown = hasCompanies;

  const companyDisplayName =
    displayName?.trim() || activeWorkspace?.name?.trim() || "";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (ws: ActiveWorkspace) => {
    setActiveWorkspace(ws);
    setOpen(false);
  };

  const isDrawer = variant === "drawer";

  const pillButton = (
    <button
      type="button"
      onClick={() => showDropdown && setOpen((o) => !o)}
      disabled={!showDropdown}
      className={cn(
        "flex items-center gap-2 rounded-lg border text-left transition-colors",
        isDrawer
          ? "w-full border-white/15 bg-white/5 px-3 py-2.5 hover:bg-white/10"
          : "border-[#1D376A]/15 bg-white px-2.5 py-1.5 hover:bg-[#1D376A]/[0.04]",
        showDropdown && !isDrawer && "hover:bg-[#1D376A]/[0.04]",
        !showDropdown && "cursor-default"
      )}
      aria-haspopup={showDropdown ? "listbox" : undefined}
      aria-expanded={open}
      aria-label={
        isPersonalActive
          ? t("header.context.activePersonalAria")
          : t("header.context.activeCompanyAria")
      }
    >
      {isPersonalActive ? (
        <>
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
              isDrawer ? "size-9" : "size-8"
            )}
          >
            <User className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "truncate text-sm font-medium",
                isDrawer ? "text-white" : "text-foreground"
              )}
            >
              {t("header.context.personalLabel")}
            </div>
            <div
              className={cn(
                "truncate text-[11px]",
                isDrawer ? "text-white/55" : "text-muted-foreground",
                !isDrawer && "hidden md:block"
              )}
            >
              {t("header.context.personalHelper")}
            </div>
          </div>
        </>
      ) : (
        <>
          <CompanyLogo
            logoUrl={logoUrl}
            alt={companyDisplayName}
            size={isDrawer ? "sm" : "xs"}
          />
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "truncate text-sm font-medium",
                isDrawer ? "text-white" : "text-[#1D376A]"
              )}
            >
              {companyDisplayName}
            </div>
            <div
              className={cn(
                "text-[11px]",
                isDrawer ? "text-white/55" : "text-muted-foreground"
              )}
            >
              {t("header.context.companyLabel")}
            </div>
          </div>
        </>
      )}
      {showDropdown ? (
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform",
            isDrawer ? "text-white/60" : "text-muted-foreground",
            open && "rotate-180"
          )}
          aria-hidden
        />
      ) : null}
    </button>
  );

  return (
    <div
      ref={ref}
      className={cn("relative", isDrawer && "w-full px-3 py-2 border-b border-white/10")}
    >
      {pillButton}

      {open && showDropdown ? (
        <div
          role="listbox"
          className={cn(
            "z-50 rounded-lg border border-border bg-background py-1 shadow-lg",
            isDrawer
              ? "relative mt-2 w-full"
              : "absolute right-0 top-full mt-1 w-72 max-w-[calc(100vw-2rem)]"
          )}
        >
          {isPersonalActive && hasCompanies ? (
            <div className="border-b border-border px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">
                {t("header.context.switchToCompany")}
              </p>
            </div>
          ) : null}

          {hasCompanies ? (
            <div className="py-1">
              {(hasMultipleCompanies || isPersonalActive) && (
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {hasMultipleCompanies
                    ? t("header.context.switchCompany")
                    : t("header.context.companiesSection")}
                </p>
              )}
              <ul role="presentation">
                {companies.map((ws) => {
                  const selected = activeWorkspace?.id === ws.id;
                  return (
                    <li key={ws.id} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onClick={() => handleSelect(ws)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                          selected
                            ? "bg-primary/10 font-medium text-primary"
                            : "hover:bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
                            selected
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {getCompanyInitials(ws.name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                        {selected ? (
                          <Check className="size-4 shrink-0" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {hasPersonal && hasCompanies ? (
            <div className="border-t border-border py-1">
              <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("header.context.personalSection")}
              </p>
              <p className="px-3 pb-2 text-xs text-muted-foreground">
                {t("header.context.personalHelper")}
              </p>
              <button
                type="button"
                role="option"
                aria-selected={isPersonalActive}
                onClick={() => personalWorkspace && handleSelect(personalWorkspace)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                  isPersonalActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "hover:bg-muted"
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <User className="size-4" aria-hidden />
                </span>
                <span className="flex-1">{t("header.context.personalLabel")}</span>
                {isPersonalActive ? (
                  <Check className="size-4 shrink-0" aria-hidden />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("header.context.switchToPersonal")}
                  </span>
                )}
              </button>
            </div>
          ) : null}

          {!isPersonalActive && canManage ? (
            <div className="border-t border-border py-1">
              <Link
                href="/app/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Settings className="size-4 shrink-0" aria-hidden />
                {t("companyContext.settings")}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

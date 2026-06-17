"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { NavSectionConfig } from "@/lib/sidebarNavigation";
import { sectionHasFlyout } from "@/lib/sidebarNavigation";
import styles from "./sidebarRail.module.css";

type SidebarRailIconProps = {
  section: NavSectionConfig;
  sectionLabel: string;
  isActive: boolean;
  isHovered: boolean;
  showBadge?: boolean;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  isFieldWorker?: boolean;
  enabledModules?: import("@/lib/enabledModules").EnabledModulesMap | null;
  onHover: () => void;
  onNavigate?: () => void;
};

export function SidebarRailIcon({
  section,
  sectionLabel,
  isActive,
  isHovered,
  showBadge,
  isPersonalWorkspace,
  canManage,
  isFieldWorker = false,
  enabledModules = null,
  onHover,
  onNavigate,
}: SidebarRailIconProps) {
  const Icon = section.icon;
  const filterOpts = { isPersonalWorkspace, canManage, isFieldWorker, enabledModules };
  const hasFlyout = sectionHasFlyout(section, filterOpts);
  const directHref = !hasFlyout ? section.defaultHref : undefined;

  const className = cn(
    styles.iconButton,
    section.id === "overview" && styles.homeGlow,
    (isActive || isHovered) && styles.iconButtonActive
  );

  const iconEl = <Icon className="relative z-[1] size-5" aria-hidden />;

  if (directHref) {
    return (
      <Link
        href={directHref}
        className={className}
        aria-label={sectionLabel}
        aria-current={isActive ? "page" : undefined}
        onMouseEnter={onHover}
        onFocus={onHover}
        onClick={() => onNavigate?.()}
      >
        {iconEl}
        {showBadge ? <span className={styles.badgeDot} aria-hidden /> : null}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={sectionLabel}
      aria-haspopup="true"
      aria-expanded={isHovered}
      onMouseEnter={onHover}
      onFocus={onHover}
    >
      {iconEl}
      {showBadge ? <span className={styles.badgeDot} aria-hidden /> : null}
    </button>
  );
}

"use client";

import { FileText, ImageIcon, Table2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { EstimatorDocument } from "@/types/estimatorPositions";

type Props = {
  documents: EstimatorDocument[];
  activeDocumentId: string | null;
  onSelectDocument: (documentId: string) => void;
  className?: string;
};

function roleIcon(role: EstimatorDocument["role"]) {
  switch (role) {
    case "photo":
      return ImageIcon;
    case "schedule":
    case "pricebook":
      return Table2;
    default:
      return FileText;
  }
}

function roleLabelKey(role: EstimatorDocument["role"]): string {
  return `projects.aiSetup.documents.role.${role}`;
}

export function EstimatorDocumentSwitcher({
  documents,
  activeDocumentId,
  onSelectDocument,
  className,
}: Props) {
  const { t } = useI18n();

  if (documents.length <= 1) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {documents.map((doc) => {
        const Icon = roleIcon(doc.role);
        const active = doc.id === activeDocumentId;
        return (
          <button
            key={doc.id}
            type="button"
            onClick={() => onSelectDocument(doc.id)}
            className={cn(
              "inline-flex max-w-[220px] items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors",
              active
                ? "border-[#1D376A] bg-[#1D376A] text-white"
                : "border-[#CBD5E1] bg-white text-[#334155] hover:border-[#1D376A]/40"
            )}
            title={doc.fileName}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate font-medium">{doc.fileName}</span>
            <span
              className={cn(
                "shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold uppercase",
                active ? "bg-white/20 text-white" : "bg-[#F1F5F9] text-[#64748B]"
              )}
            >
              {t(roleLabelKey(doc.role))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

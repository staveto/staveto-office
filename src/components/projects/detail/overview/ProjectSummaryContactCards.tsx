"use client";

import { useState } from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import type { ProjectDoc } from "@/lib/projects";
import { excerptText, getProjectSummaryText } from "@/lib/projectDashboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  project: ProjectDoc;
  customerName?: string;
  location?: string;
};

export function ProjectSummaryCard({ project }: { project: ProjectDoc }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const fullSummary = getProjectSummaryText(project);
  const excerpt = excerptText(fullSummary, 180);
  const hasMore = fullSummary.length > excerpt.length;

  if (!excerpt) return null;

  return (
    <>
      <section className={cn(po.card, "p-4 opacity-95")}>
        <h2 className={cn(po.titleSm, "mb-2 text-[var(--po-text-secondary)]")}>
          {t("projects.dashboard.summary.title")}
        </h2>
        <p className={cn(po.body, "leading-relaxed")}>{excerpt}</p>
        {hasMore ? (
          <Button
            variant="link"
            className={cn("mt-2 h-auto p-0", po.link)}
            onClick={() => setOpen(true)}
          >
            {t("projects.dashboard.summary.showMore")}
          </Button>
        ) : null}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("projects.dashboard.summary.modalTitle")}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{fullSummary}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProjectContactCard({ project, customerName, location }: Props) {
  const { t } = useI18n();
  const email = project.customerEmail?.trim();
  const phone = project.customerPhone?.trim();

  return (
    <section className={cn(po.card, "p-4")}>
      <h2 className={cn(po.title, "mb-3")}>{t("projects.dashboard.contactCard.title")}</h2>
      <dl className="space-y-2 text-sm">
        {customerName ? (
          <div>
            <dt className={po.muted}>{t("projects.draft.customerName")}</dt>
            <dd className={po.bodyStrong}>{customerName}</dd>
          </div>
        ) : null}
        {location ? (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--po-text-muted)]" />
            <dd className={po.bodyStrong}>{location}</dd>
          </div>
        ) : null}
        <div>
          <dt className={po.muted}>{t("projects.draft.customerEmail")}</dt>
          <dd className={po.bodyStrong}>
            {email ? (
              <a href={`mailto:${email}`} className={po.link}>
                <Mail className="mr-1 inline size-3.5" />
                {email}
              </a>
            ) : (
              t("projects.dashboard.notSet")
            )}
          </dd>
        </div>
        <div>
          <dt className={po.muted}>{t("projects.draft.customerPhone")}</dt>
          <dd className={po.bodyStrong}>
            {phone ? (
              <a href={`tel:${phone}`} className={po.link}>
                <Phone className="mr-1 inline size-3.5" />
                {phone}
              </a>
            ) : (
              t("projects.dashboard.notSet")
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

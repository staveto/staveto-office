"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { Button, buttonVariants } from "@/components/ui/button";
import { hasProjectAccess, listProjectQuoteDraftItems, listProjectTasks } from "@/lib/projects";
import { getOrganizationForQuotePrint } from "@/lib/organizationProfile";
import type { OrganizationPrintInfo } from "@/lib/organizationProfile";
import type { ProjectDoc } from "@/lib/projects";
import type { QuoteDoc } from "@/lib/quotes";
import { QuotePrintDocument } from "@/components/quotes/QuotePrintDocument";
import { buildQuoteDocFromProjectDraft } from "@/lib/projectQuotePrint";
import styles from "@/components/quotes/quote-print.module.css";

export default function ProjectQuotePrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const id = params.id as string;
  const fromAiSetup = searchParams.get("setup") === "ai";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [quote, setQuote] = useState<QuoteDoc | null>(null);
  const [organization, setOrganization] = useState<OrganizationPrintInfo | null>(null);
  const [project, setProject] = useState<ProjectDoc | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      try {
        const access = await hasProjectAccess(id, user.id);
        if (!access.allowed || !access.project) {
          setNotFound(true);
          return;
        }

        const loadedProject = access.project;
        setProject(loadedProject);

        const [quoteItems, tasks] = await Promise.all([
          listProjectQuoteDraftItems(id),
          listProjectTasks(id).catch(() => []),
        ]);

        setQuote(buildQuoteDocFromProjectDraft(loadedProject, quoteItems, tasks));

        if (loadedProject.orgId) {
          const org = await getOrganizationForQuotePrint(loadedProject.orgId);
          setOrganization(org);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user?.id]);

  const localeTag =
    locale === "de" ? "de-DE" : locale === "en" ? "en-GB" : "sk-SK";

  const backHref = fromAiSetup
    ? `/app/projects/${id}?setup=ai`
    : `/app/projects/${id}`;

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound || !quote || !project) {
    return (
      <div className={styles.page}>
        <div className="max-w-lg mx-auto text-center space-y-4 py-24">
          <p className="text-destructive font-medium">{t("projects.accessDenied")}</p>
          <Link href={backHref} className={buttonVariants()}>
            {t("projects.aiSetup.print.backToSetup")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.toolbar} ${styles.noPrint}`}>
        <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-4 mr-1" />
          {fromAiSetup ? t("projects.aiSetup.print.backToSetup") : t("projects.titleJobs")}
        </Link>
        <div className={styles.toolbarActions}>
          <Button
            type="button"
            size="sm"
            className="bg-[#e06737] hover:bg-[#c95a30] text-white"
            onClick={() => window.print()}
          >
            <Printer className="size-4 mr-1" />
            {t("quotes.print.printAction")}
          </Button>
        </div>
      </div>

      <QuotePrintDocument
        quote={quote}
        organization={organization}
        project={project}
        t={t}
        locale={localeTag}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button, buttonVariants } from "@/components/ui/button";
import { hasQuoteAccess } from "@/services/quotes";
import { hasProjectAccess, listProjectQuoteDraftItems, listProjectTasks } from "@/lib/projects";
import { getOrganizationForQuotePrint } from "@/lib/organizationProfile";
import type { OrganizationPrintInfo } from "@/lib/organizationProfile";
import type { QuoteDoc } from "@/lib/quotes";
import type { ProjectDoc } from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import type { TaskDoc } from "@/lib/projects";
import { QuotePrintDocument } from "@/components/quotes/QuotePrintDocument";
import {
  buildQuotePrintContext,
  buildQuotePrintContextFromQuote,
} from "@/lib/quoteDocumentMeta";
import { isProjectDraftQuoteId, projectIdFromDraftQuoteId } from "@/lib/projectQuotePrint";
import { buildQuoteDocFromProjectDraft } from "@/lib/projectQuotePrint";
import { listMaterialSuggestions } from "@/services/materials/projectMaterialsService";
import type { MaterialSuggestionDoc } from "@/services/materials/types";
import styles from "@/components/quotes/quote-print.module.css";

export default function QuotePrintPage() {
  const params = useParams();
  const { t, locale } = useI18n();
  const { user, profile } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [quote, setQuote] = useState<QuoteDoc | null>(null);
  const [organization, setOrganization] = useState<OrganizationPrintInfo | null>(null);
  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteDraftItemDoc[]>([]);
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [suggestions, setSuggestions] = useState<MaterialSuggestionDoc[]>([]);

  useEffect(() => {
    if (!user?.id || !activeWorkspace) return;

    (async () => {
      try {
        const access = await hasQuoteAccess(id, user.id, activeWorkspace);
        if (!access.allowed || !access.quote) {
          setNotFound(true);
          return;
        }

        let loadedQuote = access.quote;
        let loadedProject: ProjectDoc | null = null;

        const draftProjectId = isProjectDraftQuoteId(id)
          ? projectIdFromDraftQuoteId(id)
          : loadedQuote.projectId;

        if (draftProjectId) {
          const projectAccess = await hasProjectAccess(draftProjectId, user.id);
          if (projectAccess.project) {
            loadedProject = projectAccess.project;
            const [items, loadedTasks, loadedSuggestions] = await Promise.all([
              listProjectQuoteDraftItems(draftProjectId),
              listProjectTasks(draftProjectId).catch(() => []),
              listMaterialSuggestions(draftProjectId).catch(() => []),
            ]);
            setQuoteItems(items);
            setTasks(loadedTasks);
            setSuggestions(loadedSuggestions);
            if (isProjectDraftQuoteId(id)) {
              loadedQuote = buildQuoteDocFromProjectDraft(
                loadedProject,
                items,
                loadedTasks,
                loadedQuote.currency,
                loadedSuggestions
              );
            }
          }
        }

        setQuote(loadedQuote);
        setProject(loadedProject);

        if (loadedQuote.orgId) {
          const org = await getOrganizationForQuotePrint(loadedQuote.orgId);
          setOrganization(org);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user?.id, activeWorkspace?.id]);

  const localeTag =
    locale === "de" ? "de-DE" : locale === "en" ? "en-GB" : "sk-SK";

  const printContext = useMemo(() => {
    if (!quote) return null;
    const userInfo = { name: user?.name, email: user?.email, phone: profile?.phoneE164 };
    if (project && quoteItems.length >= 0) {
      return buildQuotePrintContext({
        project,
        quote,
        quoteItems,
        tasks,
        suggestions,
        organization,
        user: userInfo,
        t,
      });
    }
    return buildQuotePrintContextFromQuote({
      quote,
      project,
      organization,
      user: userInfo,
      t,
    });
  }, [quote, project, quoteItems, tasks, suggestions, organization, user, profile, t]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound || !quote || !printContext) {
    return (
      <div className={styles.page}>
        <div className="max-w-lg mx-auto text-center space-y-4 py-24">
          <p className="text-destructive font-medium">{t("quotes.notFound")}</p>
          <Link href={`/app/quotes/${id}`} className={buttonVariants()}>
            {t("quotes.print.backToQuote")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.toolbar} ${styles.noPrint}`}>
        <Link
          href={`/app/quotes/${id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft className="size-4 mr-1" />
          {t("quotes.print.backToQuote")}
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
        printContext={printContext}
        t={t}
        locale={localeTag}
      />
    </div>
  );
}

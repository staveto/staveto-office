"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { Button, buttonVariants } from "@/components/ui/button";
import { hasQuoteAccess } from "@/services/quotes";
import { hasProjectAccess } from "@/lib/projects";
import { getOrganizationForQuotePrint } from "@/lib/organizationProfile";
import type { OrganizationPrintInfo } from "@/lib/organizationProfile";
import type { QuoteDoc } from "@/lib/quotes";
import type { ProjectDoc } from "@/lib/projects";
import { QuotePrintDocument } from "@/components/quotes/QuotePrintDocument";
import styles from "@/components/quotes/quote-print.module.css";

export default function QuotePrintPage() {
  const params = useParams();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [quote, setQuote] = useState<QuoteDoc | null>(null);
  const [organization, setOrganization] = useState<OrganizationPrintInfo | null>(null);
  const [project, setProject] = useState<ProjectDoc | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      try {
        const access = await hasQuoteAccess(id, user.id);
        if (!access.allowed || !access.quote) {
          setNotFound(true);
          return;
        }

        const loadedQuote = access.quote;
        setQuote(loadedQuote);

        if (loadedQuote.orgId) {
          const org = await getOrganizationForQuotePrint(loadedQuote.orgId);
          setOrganization(org);
        }

        if (loadedQuote.projectId) {
          const projectAccess = await hasProjectAccess(loadedQuote.projectId, user.id);
          if (projectAccess.project) {
            setProject(projectAccess.project);
          }
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

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound || !quote) {
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
        t={t}
        locale={localeTag}
      />
    </div>
  );
}

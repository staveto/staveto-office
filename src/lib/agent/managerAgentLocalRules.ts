import type { AgentInsight, AgentSuggestedAction } from "./managerAgentContract";
import type { ManagerScreenContext } from "./managerScreenContext";

function localInsight(
  partial: Omit<AgentInsight, "source" | "requiresConfirmation"> & {
    requiresConfirmation?: boolean;
  }
): AgentInsight {
  return {
    source: "local",
    requiresConfirmation: partial.requiresConfirmation ?? Boolean(partial.suggestedAction),
    ...partial,
  };
}

function navigateAction(
  label: string,
  description: string,
  targetRoute: string
): AgentSuggestedAction {
  return {
    type: "navigate",
    label,
    description,
    targetRoute,
    riskLevel: "low",
    confirmationText: label,
  };
}

export function runManagerAgentLocalRules(ctx: ManagerScreenContext): AgentInsight[] {
  const insights: AgentInsight[] = [];

  if (ctx.screenType === "company_settings") {
    if (ctx.missingFields.includes("registered_country") || !ctx.companyCountryCode) {
      insights.push(
        localInsight({
          id: "local-company-country-missing",
          severity: "warning",
          title: "Registered country is missing",
          message: "Set the registered company country so market rules, tax labels and document defaults apply correctly.",
          reason: "companyCountryCode is empty on the active workspace.",
          confidence: "high",
          suggestedAction: navigateAction(
            "Open company settings",
            "Go to company profile and select the registered country.",
            "/app/settings/company"
          ),
        })
      );
    }

    if (ctx.companyCountryCode?.toUpperCase() === "CH" && ctx.warnings.includes("ch_vat_id_missing")) {
      insights.push(
        localInsight({
          id: "local-ch-vat-missing",
          severity: "warning",
          title: "MWST/UID may be missing for Switzerland",
          message: "Swiss company documents often need VAT/MWST identifiers. Add them before exporting customer documents.",
          reason: "Company country is CH and VAT/MWST field appears empty.",
          confidence: "high",
        })
      );
    }

    if (ctx.missingFields.includes("legal_name")) {
      insights.push(
        localInsight({
          id: "local-company-legal-name",
          severity: "warning",
          title: "Legal company name is missing",
          message: "Add the legal name used on quotes and invoices.",
          reason: "Legal name field is empty.",
          confidence: "high",
        })
      );
    }

    if (ctx.missingFields.includes("logo")) {
      insights.push(
        localInsight({
          id: "local-company-logo",
          severity: "opportunity",
          title: "Company logo is not uploaded",
          message: "Upload a logo to improve exported documents and customer-facing PDFs.",
          reason: "Logo URL is missing in company profile.",
          confidence: "high",
        })
      );
    }
  }

  if (ctx.screenType === "quote_detail") {
    if (ctx.warnings.includes("quote_currency_mismatch")) {
      insights.push(
        localInsight({
          id: "local-quote-currency-mismatch",
          severity: "warning",
          title: "Quote currency differs from company currency",
          message: "Review the quote currency before sending it to the customer.",
          reason: "Quote currency does not match active company currency.",
          confidence: "high",
        })
      );
    }

    if (ctx.missingFields.includes("customer_email")) {
      insights.push(
        localInsight({
          id: "local-quote-customer-email",
          severity: "warning",
          title: "Customer email is missing",
          message: "Add a customer email if you plan to send the quote digitally.",
          reason: "Customer email field is empty.",
          confidence: "high",
        })
      );
    }

    if (ctx.warnings.includes("accepted_quote_without_tasks")) {
      insights.push(
        localInsight({
          id: "local-quote-no-tasks",
          severity: "opportunity",
          title: "Accepted quote without project tasks",
          message: "Consider creating or reviewing project tasks so execution can start.",
          reason: "Quote is accepted but linked project has no tasks.",
          confidence: "medium",
          suggestedAction: ctx.selectedAction
            ? navigateAction(
                "Review linked project",
                "Open the related project and plan the first tasks.",
                ctx.selectedAction
              )
            : undefined,
          relatedEntityType: "quote",
          relatedEntityId: ctx.visibleEntityId ?? undefined,
        })
      );
    }
  }

  if (ctx.screenType === "project_detail") {
    if (ctx.warnings.includes("no_assigned_members")) {
      insights.push(
        localInsight({
          id: "local-project-no-members",
          severity: "warning",
          title: "No team members assigned",
          message: "Assign at least one responsible person before work starts on site.",
          reason: "Project has no assigned members in the active workspace.",
          confidence: "high",
        })
      );
    }

    if (ctx.missingFields.includes("location")) {
      insights.push(
        localInsight({
          id: "local-project-location",
          severity: "warning",
          title: "Project location is missing",
          message: "Add the site address for planning, logistics and field coordination.",
          reason: "Location field is empty.",
          confidence: "high",
        })
      );
    }

    if (ctx.missingFields.includes("tasks")) {
      insights.push(
        localInsight({
          id: "local-project-no-tasks",
          severity: "opportunity",
          title: "Project has no tasks yet",
          message: "Break the job into phases and tasks so the team knows what to do next.",
          reason: "Task list is empty.",
          confidence: "high",
        })
      );
    }

    if (ctx.missingFields.includes("scope_from_documents")) {
      insights.push(
        localInsight({
          id: "local-project-docs-scope",
          severity: "opportunity",
          title: "Documents attached but scope may be incomplete",
          message: "Use the AI project assistant to extract scope, phases and tasks from attached documents.",
          reason: "Project has attachments but no extracted scope signal was provided.",
          confidence: "medium",
          suggestedAction: {
            type: "open_ai_assistant",
            label: "Open AI project assistant",
            description: "Review or regenerate the project plan from existing documents.",
            targetRoute: ctx.visibleEntityId
              ? `/app/projects/${ctx.visibleEntityId}?setup=ai`
              : undefined,
            riskLevel: "low",
            confirmationText: "Open AI project assistant",
          },
          relatedEntityType: "project",
          relatedEntityId: ctx.visibleEntityId ?? undefined,
        })
      );
    }
  }

  if (ctx.screenType === "new_project_wizard") {
    if (ctx.warnings.includes("brief_too_short")) {
      insights.push(
        localInsight({
          id: "local-wizard-brief-short",
          severity: "info",
          title: "Project description is very short",
          message: "Add more detail about scope, exclusions, deadlines and site conditions to improve the AI draft.",
          reason: "Brief length is under 40 characters.",
          confidence: "high",
        })
      );
    }

    if (ctx.missingFields.includes("ai_brief_from_attachments")) {
      insights.push(
        localInsight({
          id: "local-wizard-attachments",
          severity: "opportunity",
          title: "Attachments can power the AI draft",
          message: "Continue to the draft step so Staveto can read your PDFs and propose phases, tasks and materials.",
          reason: "Attachments are present in the wizard.",
          confidence: "high",
          suggestedAction: {
            type: "open_ai_brief",
            label: "Continue with AI draft",
            description: "Move to the AI draft step using the uploaded documents.",
            riskLevel: "low",
            confirmationText: "Continue with AI draft",
          },
        })
      );
    }

    if (ctx.missingFields.includes("location")) {
      insights.push(
        localInsight({
          id: "local-wizard-location",
          severity: "info",
          title: "Location is not filled in",
          message: "Add the site location so planning and logistics are clearer in the draft.",
          reason: "Location field is empty in the wizard.",
          confidence: "high",
        })
      );
    }
  }

  if (ctx.screenType === "dashboard") {
    if (ctx.warnings.includes("delayed_jobs_in_workspace")) {
      insights.push(
        localInsight({
          id: "local-dashboard-delayed",
          severity: "warning",
          title: "Delayed jobs need attention",
          message: "Review active projects with delays in the current workspace.",
          reason: "Dashboard reports delayed jobs in scoped workspace metrics.",
          confidence: "medium",
          suggestedAction: navigateAction(
            "Open projects",
            "Review delayed jobs in the project list.",
            "/app/projects"
          ),
        })
      );
    }

    insights.push(
      localInsight({
        id: "local-dashboard-next",
        severity: "info",
        title: "Start from the active workspace",
        message: "Use projects, quotes and company settings in the current workspace only.",
        reason: "Dashboard advice is scoped to activeWorkspaceId.",
        confidence: "high",
      })
    );
  }

  if (ctx.unsavedChanges) {
    insights.push(
      localInsight({
        id: "local-unsaved-changes",
        severity: "warning",
        title: "Unsaved changes on this screen",
        message: "Save or discard your changes before leaving this screen.",
        reason: "Screen context reports unsavedChanges=true.",
        confidence: "high",
      })
    );
  }

  return insights;
}

export function mergeAgentInsights(
  localInsights: AgentInsight[],
  aiInsights: AgentInsight[]
): AgentInsight[] {
  const seen = new Set<string>();
  const merged: AgentInsight[] = [];

  for (const insight of [...localInsights, ...aiInsights]) {
    if (seen.has(insight.id)) continue;
    seen.add(insight.id);
    merged.push(insight);
  }

  return merged;
}

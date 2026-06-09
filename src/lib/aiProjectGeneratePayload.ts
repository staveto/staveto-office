import type { ContactMode } from "@/components/jobs/new/newJobWizardTypes";
import type { CustomerDoc, CustomerType } from "@/lib/customers";
import { getNewJobArchetypeAiContextHint } from "@/lib/aiProjectContext";
import type { WorkType } from "@/lib/workTypes";

/** Mobile unified flow: project name + description in one brief. */
export function buildAiProjectBriefForGenerate(
  projectName: string,
  projectDescription: string
): string {
  return [projectName.trim(), projectDescription.trim()].filter(Boolean).join("\n\n").trim();
}

/** Mobile `buildUnifiedOptionalDetails` — archetype hint + extra context. */
export function buildUnifiedAiProjectDetails(params: {
  archetype: WorkType;
  extraContext?: string;
  location?: string;
}): string | undefined {
  const parts: string[] = [getNewJobArchetypeAiContextHint(params.archetype)];
  const extra = params.extraContext?.trim();
  if (extra) parts.push(extra);
  const loc = params.location?.trim();
  if (loc) parts.push(`Location: ${loc}`);
  return parts.filter(Boolean).join(" | ") || undefined;
}

function buildNewContactAiContextBlock(input: {
  name: string;
  type: CustomerType;
  email?: string;
  phone?: string;
  address?: string;
  companyName?: string;
}): string {
  const lines = [
    "Selected contact:",
    `Name: ${input.name.trim()}`,
    input.companyName?.trim() ? `Company: ${input.companyName.trim()}` : undefined,
    `Type: ${input.type}`,
    input.email?.trim() ? `Email: ${input.email.trim()}` : undefined,
    input.phone?.trim() ? `Phone: ${input.phone.trim()}` : undefined,
    input.address?.trim() ? `Address: ${input.address.trim()}` : undefined,
  ].filter((line): line is string => !!line && line.length > 0);
  return lines.join("\n");
}

function buildCustomerAiContextBlock(contact: CustomerDoc): string {
  return buildNewContactAiContextBlock({
    name: contact.name,
    type: contact.type,
    email: contact.email,
    phone: contact.phone,
    address: contact.address ?? contact.addressText,
    companyName: contact.companyName,
  });
}

/** Mobile `appendContactToProjectDetails`. */
export function appendContactToAiProjectDetails(
  projectDetails: string | undefined,
  params: {
    contactMode: ContactMode;
    selectedCustomer: CustomerDoc | null;
    newContactName?: string;
    newContactType?: CustomerType;
    newContactEmail?: string;
    newContactPhone?: string;
    newContactAddress?: string;
    newContactCompanyName?: string;
  }
): string | undefined {
  let block: string | undefined;
  if (params.contactMode === "existing" && params.selectedCustomer) {
    block = buildCustomerAiContextBlock(params.selectedCustomer);
  } else if (params.contactMode === "new" && params.newContactName?.trim()) {
    block = buildNewContactAiContextBlock({
      name: params.newContactName.trim(),
      type: params.newContactType ?? "person",
      email: params.newContactEmail,
      phone: params.newContactPhone,
      address: params.newContactAddress,
      companyName: params.newContactCompanyName,
    });
  }
  if (!block) return projectDetails;
  if (!projectDetails?.trim()) return block;
  return `${projectDetails.trim()}\n\n${block}`;
}

/**
 * Customer display + project field mapping (person vs company, legacy fallback).
 */
import type { CustomerDoc, CustomerType, CreateCustomerInput } from "./customers";

export type ProjectCustomerFields = {
  customerId?: string;
  customerName?: string;
  customerCompanyName?: string;
  customerContactPersonName?: string;
  customerEmail?: string;
  customerPhone?: string;
};

export function resolveCustomerType(
  c: Pick<CustomerDoc, "type" | "customerType">
): CustomerType {
  if (c.customerType === "company" || c.type === "company") return "company";
  return "person";
}

export function getCustomerCompanyName(c: CustomerDoc): string | undefined {
  const company = c.companyName?.trim();
  if (company) return company;
  if (resolveCustomerType(c) === "company") return c.name?.trim() || undefined;
  return undefined;
}

export function getCustomerContactPersonName(c: CustomerDoc): string | undefined {
  return c.contactPersonName?.trim() || undefined;
}

export function getCustomerDisplayName(c: CustomerDoc): string {
  if (resolveCustomerType(c) === "company") {
    return getCustomerCompanyName(c) || c.name?.trim() || "";
  }
  return c.name?.trim() || "";
}

export function projectCustomerFieldsFromDoc(c: CustomerDoc): ProjectCustomerFields {
  const type = resolveCustomerType(c);
  return {
    customerId: c.id,
    customerName: getCustomerDisplayName(c) || undefined,
    customerCompanyName: type === "company" ? getCustomerCompanyName(c) : undefined,
    customerContactPersonName: type === "company" ? getCustomerContactPersonName(c) : undefined,
    customerEmail: c.email,
    customerPhone: c.phone,
  };
}

export function buildCreateCustomerInput(params: {
  type: CustomerType;
  personName?: string;
  companyName?: string;
  contactPersonName?: string;
  email?: string;
  phone?: string;
  ico?: string;
  vatId?: string;
  address?: string;
}): CreateCustomerInput {
  const type = params.type;
  const addressText = params.address?.trim() || undefined;
  const vatId = params.vatId?.trim() || undefined;

  if (type === "company") {
    const companyName = params.companyName?.trim() || "";
    const contactPersonName = params.contactPersonName?.trim() || "";
    return {
      type: "company",
      name: companyName,
      companyName,
      contactPersonName,
      email: params.email?.trim() || undefined,
      phone: params.phone?.trim() || undefined,
      ico: params.ico?.trim() || undefined,
      vatId,
      taxId: vatId,
      address: addressText,
      addressText,
    };
  }

  const personName = params.personName?.trim() || "";
  return {
    type: "person",
    name: personName,
    email: params.email?.trim() || undefined,
    phone: params.phone?.trim() || undefined,
    ico: params.ico?.trim() || undefined,
    vatId,
    taxId: vatId,
    address: addressText,
    addressText,
  };
}

export function projectCustomerFieldsFromNewInput(
  customerId: string,
  input: CreateCustomerInput
): ProjectCustomerFields {
  if (input.type === "company") {
    const companyName = input.companyName?.trim() || input.name.trim();
    const contactPersonName = input.contactPersonName?.trim() || undefined;
    return {
      customerId,
      customerName: companyName,
      customerCompanyName: companyName,
      customerContactPersonName: contactPersonName,
      customerEmail: input.email,
      customerPhone: input.phone,
    };
  }

  const personName = input.name.trim();
  return {
    customerId,
    customerName: personName,
    customerEmail: input.email,
    customerPhone: input.phone,
  };
}

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  Car,
  ClipboardList,
  Cloud,
  DollarSign,
  FileScan,
  FileText,
  FolderOpen,
  HardDrive,
  Mail,
  Map,
  MapPin,
  MessageCircle,
  MessageSquare,
  Mic,
  Navigation,
  Package,
  Receipt,
  Route,
  ScanLine,
  Sparkles,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { ModuleKey } from "@/lib/enabledModules";

export type AppCenterCategory =
  | "all"
  | "core"
  | "communication"
  | "accounting"
  | "maps"
  | "storage"
  | "ai"
  | "workforce"
  | "finance";

export const APP_CENTER_CATEGORIES: readonly AppCenterCategory[] = [
  "all",
  "core",
  "communication",
  "accounting",
  "maps",
  "storage",
  "ai",
  "workforce",
  "finance",
] as const;

export type AppCenterCatalogItem = {
  id: string;
  category: Exclude<AppCenterCategory, "all">;
  nameKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  /** Core module toggle via enabledModules */
  moduleKey?: ModuleKey;
  /** Integration record key in organization.integrations */
  integrationKey?: string;
  /** Cannot be disabled (required module) */
  required?: boolean;
  /** Always coming soon — no toggle */
  comingSoon?: boolean;
  /** Show OAuth verification note (Gmail) */
  oauthNote?: boolean;
  /** Server-side feature — status from runtime probe */
  serverSideProbe?: "googleMaps" | "aiInvoiceOcr";
};

export const APP_CENTER_CATALOG: AppCenterCatalogItem[] = [
  // Core Modules
  { id: "projects", category: "core", nameKey: "appCenter.apps.projects.name", descriptionKey: "appCenter.apps.projects.desc", icon: Briefcase, moduleKey: "jobs", required: true },
  { id: "tasks", category: "core", nameKey: "appCenter.apps.tasks.name", descriptionKey: "appCenter.apps.tasks.desc", icon: ClipboardList, comingSoon: true },
  { id: "planning", category: "core", nameKey: "appCenter.apps.planning.name", descriptionKey: "appCenter.apps.planning.desc", icon: CalendarDays, moduleKey: "planning" },
  { id: "documents", category: "core", nameKey: "appCenter.apps.documents.name", descriptionKey: "appCenter.apps.documents.desc", icon: FolderOpen, moduleKey: "documents" },
  { id: "reports", category: "core", nameKey: "appCenter.apps.reports.name", descriptionKey: "appCenter.apps.reports.desc", icon: BarChart3, moduleKey: "reports" },
  { id: "equipment", category: "core", nameKey: "appCenter.apps.equipment.name", descriptionKey: "appCenter.apps.equipment.desc", icon: Wrench, moduleKey: "equipment" },
  { id: "attendance", category: "core", nameKey: "appCenter.apps.attendance.name", descriptionKey: "appCenter.apps.attendance.desc", icon: Users, comingSoon: true },
  { id: "expenses", category: "core", nameKey: "appCenter.apps.expenses.name", descriptionKey: "appCenter.apps.expenses.desc", icon: Wallet, moduleKey: "expenses" },
  { id: "quotations", category: "core", nameKey: "appCenter.apps.quotations.name", descriptionKey: "appCenter.apps.quotations.desc", icon: Receipt, moduleKey: "quotes" },
  { id: "invoices", category: "core", nameKey: "appCenter.apps.invoices.name", descriptionKey: "appCenter.apps.invoices.desc", icon: DollarSign, moduleKey: "billing", required: true },

  // Communication
  { id: "gmail", category: "communication", nameKey: "appCenter.apps.gmail.name", descriptionKey: "appCenter.apps.gmail.desc", icon: Mail, integrationKey: "gmail", comingSoon: true, oauthNote: true },
  { id: "outlook", category: "communication", nameKey: "appCenter.apps.outlook.name", descriptionKey: "appCenter.apps.outlook.desc", icon: Mail, integrationKey: "outlook", comingSoon: true },
  { id: "whatsapp", category: "communication", nameKey: "appCenter.apps.whatsapp.name", descriptionKey: "appCenter.apps.whatsapp.desc", icon: MessageCircle, integrationKey: "whatsapp", comingSoon: true },
  { id: "teams", category: "communication", nameKey: "appCenter.apps.teams.name", descriptionKey: "appCenter.apps.teams.desc", icon: MessageSquare, integrationKey: "teams", comingSoon: true },
  { id: "slack", category: "communication", nameKey: "appCenter.apps.slack.name", descriptionKey: "appCenter.apps.slack.desc", icon: MessageSquare, integrationKey: "slack", comingSoon: true },

  // Accounting
  { id: "bexio", category: "accounting", nameKey: "appCenter.apps.bexio.name", descriptionKey: "appCenter.apps.bexio.desc", icon: Building2, integrationKey: "bexio", comingSoon: true },
  { id: "abacus", category: "accounting", nameKey: "appCenter.apps.abacus.name", descriptionKey: "appCenter.apps.abacus.desc", icon: Calculator, integrationKey: "abacus", comingSoon: true },
  { id: "sevdesk", category: "accounting", nameKey: "appCenter.apps.sevdesk.name", descriptionKey: "appCenter.apps.sevdesk.desc", icon: Receipt, integrationKey: "sevdesk", comingSoon: true },
  { id: "lexware", category: "accounting", nameKey: "appCenter.apps.lexware.name", descriptionKey: "appCenter.apps.lexware.desc", icon: FileText, integrationKey: "lexware", comingSoon: true },
  { id: "datev", category: "accounting", nameKey: "appCenter.apps.datev.name", descriptionKey: "appCenter.apps.datev.desc", icon: FileText, integrationKey: "datev", comingSoon: true },

  // Maps & Navigation
  { id: "googleMaps", category: "maps", nameKey: "appCenter.apps.googleMaps.name", descriptionKey: "appCenter.apps.googleMaps.desc", icon: Map, integrationKey: "googleMaps", serverSideProbe: "googleMaps" },
  { id: "waze", category: "maps", nameKey: "appCenter.apps.waze.name", descriptionKey: "appCenter.apps.waze.desc", icon: Navigation, integrationKey: "waze", comingSoon: true },
  { id: "appleMaps", category: "maps", nameKey: "appCenter.apps.appleMaps.name", descriptionKey: "appCenter.apps.appleMaps.desc", icon: MapPin, integrationKey: "appleMaps", comingSoon: true },

  // Storage
  { id: "googleDrive", category: "storage", nameKey: "appCenter.apps.googleDrive.name", descriptionKey: "appCenter.apps.googleDrive.desc", icon: HardDrive, integrationKey: "googleDrive", comingSoon: true },
  { id: "oneDrive", category: "storage", nameKey: "appCenter.apps.oneDrive.name", descriptionKey: "appCenter.apps.oneDrive.desc", icon: Cloud, integrationKey: "oneDrive", comingSoon: true },
  { id: "dropbox", category: "storage", nameKey: "appCenter.apps.dropbox.name", descriptionKey: "appCenter.apps.dropbox.desc", icon: Package, integrationKey: "dropbox", comingSoon: true },

  // AI
  { id: "aiProjectDrafts", category: "ai", nameKey: "appCenter.apps.aiProjectDrafts.name", descriptionKey: "appCenter.apps.aiProjectDrafts.desc", icon: Sparkles, integrationKey: "aiProjectDrafts", comingSoon: true },
  { id: "aiQuoteGenerator", category: "ai", nameKey: "appCenter.apps.aiQuoteGenerator.name", descriptionKey: "appCenter.apps.aiQuoteGenerator.desc", icon: Bot, integrationKey: "aiQuoteGenerator", comingSoon: true },
  { id: "aiInvoiceOcr", category: "ai", nameKey: "appCenter.apps.aiInvoiceOcr.name", descriptionKey: "appCenter.apps.aiInvoiceOcr.desc", icon: ScanLine, integrationKey: "aiInvoiceOcr", serverSideProbe: "aiInvoiceOcr" },
  { id: "aiMaterialExtraction", category: "ai", nameKey: "appCenter.apps.aiMaterialExtraction.name", descriptionKey: "appCenter.apps.aiMaterialExtraction.desc", icon: FileScan, integrationKey: "aiMaterialExtraction", comingSoon: true },
  { id: "aiEmailParser", category: "ai", nameKey: "appCenter.apps.aiEmailParser.name", descriptionKey: "appCenter.apps.aiEmailParser.desc", icon: Mail, integrationKey: "aiEmailParser", comingSoon: true },

  // Workforce
  { id: "absenceManagement", category: "workforce", nameKey: "appCenter.apps.absenceManagement.name", descriptionKey: "appCenter.apps.absenceManagement.desc", icon: CalendarDays, integrationKey: "absenceManagement", comingSoon: true },
  { id: "vehicleLogbook", category: "workforce", nameKey: "appCenter.apps.vehicleLogbook.name", descriptionKey: "appCenter.apps.vehicleLogbook.desc", icon: Car, integrationKey: "vehicleLogbook", moduleKey: "vehicles" },
  { id: "gpsTracking", category: "workforce", nameKey: "appCenter.apps.gpsTracking.name", descriptionKey: "appCenter.apps.gpsTracking.desc", icon: MapPin, integrationKey: "gpsTracking", comingSoon: true },
  { id: "teamLiveStatus", category: "workforce", nameKey: "appCenter.apps.teamLiveStatus.name", descriptionKey: "appCenter.apps.teamLiveStatus.desc", icon: Users, integrationKey: "teamLiveStatus", comingSoon: true },

  // Finance
  { id: "travelExpenses", category: "finance", nameKey: "appCenter.apps.travelExpenses.name", descriptionKey: "appCenter.apps.travelExpenses.desc", icon: Route, moduleKey: "expenses" },
  { id: "invoiceOcr", category: "finance", nameKey: "appCenter.apps.invoiceOcr.name", descriptionKey: "appCenter.apps.invoiceOcr.desc", icon: ScanLine, serverSideProbe: "aiInvoiceOcr" },
  { id: "costTracking", category: "finance", nameKey: "appCenter.apps.costTracking.name", descriptionKey: "appCenter.apps.costTracking.desc", icon: Wallet, moduleKey: "expenses" },
  { id: "mileageCalculation", category: "finance", nameKey: "appCenter.apps.mileageCalculation.name", descriptionKey: "appCenter.apps.mileageCalculation.desc", icon: Car, serverSideProbe: "googleMaps" },
];

export function parseAppCenterCategory(value: string | null | undefined): AppCenterCategory {
  if (value && (APP_CENTER_CATEGORIES as readonly string[]).includes(value)) {
    return value as AppCenterCategory;
  }
  return "all";
}

export function filterCatalogByCategory(
  items: AppCenterCatalogItem[],
  category: AppCenterCategory
): AppCenterCatalogItem[] {
  if (category === "all") return items;
  return items.filter((item) => item.category === category);
}

export function filterCatalogBySearch(
  items: AppCenterCatalogItem[],
  query: string,
  t: (key: string) => string
): AppCenterCatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const name = t(item.nameKey).toLowerCase();
    const desc = t(item.descriptionKey).toLowerCase();
    return name.includes(q) || desc.includes(q) || item.id.toLowerCase().includes(q);
  });
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  User,
  Users,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCustomersForWorkspace, type CustomerDoc } from "@/lib/customers";
import {
  getCustomerContactPersonName,
  getCustomerDisplayName,
  resolveCustomerType,
} from "@/lib/customerFields";
import { CreateCustomerDialog } from "@/components/customers/CreateCustomerDialog";

export default function CustomersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [customers, setCustomers] = useState<CustomerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const workspaceReady = Boolean(user?.id && activeWorkspace);

  const load = useCallback(async () => {
    if (!user?.id || !activeWorkspace) {
      setCustomers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listCustomersForWorkspace(activeWorkspace, user.id);
      setCustomers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("customers.loadError"));
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspace, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = [
        getCustomerDisplayName(c),
        c.name,
        c.companyName,
        c.contactPersonName,
        c.email,
        c.phone,
        c.ico,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [customers, search]);

  const handleCreated = (customer: CustomerDoc) => {
    setCustomers((prev) => {
      if (prev.some((c) => c.id === customer.id)) return prev;
      return [customer, ...prev].sort((a, b) =>
        getCustomerDisplayName(a).localeCompare(getCustomerDisplayName(b), undefined, {
          sensitivity: "base",
        })
      );
    });
  };

  return (
    <div className="space-y-6" data-testid="customers-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("customers.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("customers.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={!workspaceReady || loading}
          >
            <RefreshCw className="mr-1 size-4" />
            {t("common.refresh")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#e06737] hover:bg-[#c95a30] text-white"
            disabled={!workspaceReady}
            onClick={() => setCreateOpen(true)}
            data-testid="customers-create-open"
          >
            <Plus className="mr-1 size-4" />
            {t("customers.create")}
          </Button>
        </div>
      </div>

      {workspaceReady ? (
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("customers.searchPlaceholder")}
            className="pl-9"
            aria-label={t("customers.searchPlaceholder")}
          />
        </div>
      ) : null}

      {(loading || !workspaceReady) && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {workspaceReady && !loading && !error && customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-16">
          <Users className="mb-4 size-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t("customers.empty")}</h3>
          <p className="mt-1 mb-4 max-w-md text-center text-muted-foreground">
            {t("customers.emptyHint")}
          </p>
          <Button
            type="button"
            className="bg-[#e06737] hover:bg-[#c95a30] text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 size-4" />
            {t("customers.create")}
          </Button>
        </div>
      ) : null}

      {workspaceReady && !loading && !error && customers.length > 0 && filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("customers.searchEmpty")}
        </div>
      ) : null}

      {workspaceReady && !loading && !error && filtered.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("customers.colName")}</TableHead>
                <TableHead>{t("customers.colType")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("customers.colContact")}
                </TableHead>
                <TableHead>{t("customers.colEmail")}</TableHead>
                <TableHead>{t("customers.colPhone")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const type = resolveCustomerType(c);
                const display = getCustomerDisplayName(c) || c.name || "—";
                const contact =
                  type === "company" ? getCustomerContactPersonName(c) : undefined;
                return (
                  <TableRow key={c.id} data-testid={`customer-row-${c.id}`}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          {type === "company" ? (
                            <Building2 className="size-4" aria-hidden />
                          ) : (
                            <User className="size-4" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{display}</p>
                          {contact ? (
                            <p className="truncate text-xs text-muted-foreground md:hidden">
                              {contact}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {type === "company"
                        ? t("projects.new.customerType.company")
                        : t("projects.new.customerType.person")}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {contact || "—"}
                    </TableCell>
                    <TableCell>
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex items-center gap-1 text-[#e06737] hover:underline"
                        >
                          <Mail className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{c.email}</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone.replace(/\s/g, "")}`}
                          className="inline-flex items-center gap-1 text-[#e06737] hover:underline"
                        >
                          <Phone className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{c.phone}</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {user?.id ? (
        <CreateCustomerDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          userId={user.id}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}

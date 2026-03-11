"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { Estimate } from "@/lib/types";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "outline",
  approved: "default",
  rejected: "destructive",
};

export default function EstimatesListPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/estimates")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then(setEstimates)
      .catch(() => setError("Failed to load estimates"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Estimates</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage your quotes and estimates.
          </p>
        </div>
        <Link
          href="/estimates/new"
          className={buttonVariants()}
        >
            <Plus className="size-4 mr-2" />
            New Estimate
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {!error && estimates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 px-4">
          <FileText className="size-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No estimates yet</h3>
          <p className="text-muted-foreground text-center mt-1 mb-4">
            Create your first estimate to get started.
          </p>
          <Link
            href="/estimates/new"
            className={buttonVariants()}
          >
            <Plus className="size-4 mr-2" />
            New Estimate
          </Link>
        </div>
      )}

      {!error && estimates.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimates.map((est) => (
                <TableRow key={est.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/estimates/${est.id}`}
                      className="hover:underline text-primary"
                    >
                      {est.title}
                    </Link>
                  </TableCell>
                  <TableCell>{est.clientName}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[est.status] ?? "secondary"}>
                      {est.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(est.grandTotal)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/estimates/${est.id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * Dev-only Takeoff Dependency Doctor UI.
 * Does not change candidates, quantities, or detection logic.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc, getFirestoreInstance } from "@/lib/firebase";
import {
  buildTakeoffDoctorReport,
  defaultTakeoffFeatureInventory,
  inventoryFromPackageJson,
  type DoctorCheck,
  type DoctorReport,
  type TakeoffFirebaseInventory,
  type TakeoffPackageInventory,
} from "@/lib/takeoff/takeoffDependencyDoctor";

/** Declared deps — keep aligned with package.json (doctor inventory). */
const DECLARED_DEPS: Record<string, string> = {
  "pdfjs-dist": "yes",
  sharp: "yes",
  firebase: "yes",
  "firebase-admin": "yes",
  "tesseract.js": "yes",
  pg: "yes",
  pgvector: "yes",
  "@azure-rest/ai-document-intelligence": "yes",
};

const STATUS_CLASS: Record<DoctorCheck["status"], string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  missing: "border-slate-300 bg-slate-50 text-slate-800",
  failed: "border-red-300 bg-red-50 text-red-900",
};

export default function TakeoffDoctorPage() {
  const { user, loading: authLoading } = useAuth();
  const [projectId, setProjectId] = useState("");
  const [firebaseInv, setFirebaseInv] = useState<TakeoffFirebaseInventory | undefined>();
  const [probing, setProbing] = useState(false);
  const isDev = process.env.NODE_ENV === "development";

  const packages: TakeoffPackageInventory = useMemo(
    () => inventoryFromPackageJson(DECLARED_DEPS),
    []
  );

  const report: DoctorReport = useMemo(
    () =>
      buildTakeoffDoctorReport({
        packages,
        features: defaultTakeoffFeatureInventory({ pythonWorkerScaffold: true }),
        firebase: firebaseInv,
      }),
    [packages, firebaseInv]
  );

  const runFirebaseProbe = useCallback(async () => {
    if (!user || !projectId.trim()) {
      setFirebaseInv({
        authenticatedUser: Boolean(user),
        projectAccessOk: null,
        firestoreProjectReadable: null,
        storageBucketConfigured: Boolean(
          process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        ),
        takeoffStoragePathOk: null,
        confirmedSymbolsIndexOk: null,
        detail: user
          ? "Enter a projectId to probe Firestore."
          : "Sign in to probe Firebase.",
      });
      return;
    }
    setProbing(true);
    try {
      const db = getFirestoreInstance();
      if (!db) {
        setFirebaseInv({
          authenticatedUser: true,
          projectAccessOk: false,
          firestoreProjectReadable: false,
          storageBucketConfigured: Boolean(
            process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
          ),
          takeoffStoragePathOk: null,
          confirmedSymbolsIndexOk: null,
          detail: "Firestore is not configured.",
        });
        return;
      }
      const snap = await getDoc(doc(db, "projects", projectId.trim()));
      const readable = snap.exists();
      setFirebaseInv({
        authenticatedUser: true,
        projectAccessOk: readable,
        firestoreProjectReadable: readable,
        storageBucketConfigured: Boolean(
          process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        ),
        takeoffStoragePathOk: Boolean(
          process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        ),
        confirmedSymbolsIndexOk: null,
        detail: readable
          ? "Project document readable. confirmedSymbols index not live-queried in UI (use API with drawingId)."
          : "Project document missing or rules denied read.",
      });
    } catch (err) {
      setFirebaseInv({
        authenticatedUser: true,
        projectAccessOk: false,
        firestoreProjectReadable: false,
        storageBucketConfigured: Boolean(
          process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        ),
        takeoffStoragePathOk: null,
        confirmedSymbolsIndexOk: null,
        detail: err instanceof Error ? err.message : "Firestore probe failed.",
      });
    } finally {
      setProbing(false);
    }
  }, [user, projectId]);

  useEffect(() => {
    if (authLoading) return;
    setFirebaseInv({
      authenticatedUser: Boolean(user),
      projectAccessOk: null,
      firestoreProjectReadable: null,
      storageBucketConfigured: Boolean(
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      ),
      takeoffStoragePathOk: null,
      confirmedSymbolsIndexOk: null,
      detail: "Optional: enter projectId and run Firebase probe.",
    });
  }, [user, authLoading]);

  if (!isDev) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-6">
        <h1 className="text-xl font-semibold">Takeoff Doctor</h1>
        <p className="text-sm text-muted-foreground">
          Available only in development builds. Use{" "}
          <code className="rounded bg-muted px-1">npm run takeoff:doctor</code>{" "}
          on the server.
        </p>
        <Link href="/app" className="text-sm text-primary underline">
          Back to app
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6" data-testid="takeoff-doctor-page">
      <div>
        <h1 className="text-xl font-semibold">Takeoff Dependency Doctor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dev-only inventory of PDF takeoff packages and capabilities. Does not
          change detection or quantities. Full table:{" "}
          <code className="rounded bg-muted px-1">docs/takeoff-dependencies.md</code>
        </p>
      </div>

      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          report.canSupportSymbolMarking
            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
            : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
        data-testid="takeoff-doctor-support"
      >
        Symbol marking support:{" "}
        <strong>{report.canSupportSymbolMarking ? "YES" : "NO"}</strong>
        <span className="ml-2 text-xs opacity-80">
          ok={report.summary.ok} · warn={report.summary.warning} · missing=
          {report.summary.missing} · failed={report.summary.failed}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
          <span className="font-medium text-muted-foreground">projectId (optional probe)</span>
          <input
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Firestore project id"
          />
        </label>
        <button
          type="button"
          className="rounded-md bg-[#1D376A] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          disabled={probing || authLoading}
          onClick={() => void runFirebaseProbe()}
        >
          {probing ? "Probing…" : "Run Firebase probe"}
        </button>
        <p className="w-full text-xs text-muted-foreground">
          Auth: {authLoading ? "…" : user ? user.email || user.id : "not signed in"}
        </p>
      </div>

      <ul className="space-y-2">
        {report.checks.map((c) => (
          <li
            key={c.id}
            data-testid={`doctor-check-${c.id}`}
            className={`rounded-lg border px-3 py-2 text-sm ${STATUS_CLASS[c.status]}`}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide">
                {c.status}
              </span>
              <span className="font-medium">{c.label}</span>
              <span className="text-xs opacity-70">({c.category})</span>
            </div>
            <p className="mt-0.5 text-xs opacity-90">{c.detail}</p>
            {c.fixHint ? (
              <p className="mt-0.5 text-xs font-medium opacity-80">Fix: {c.fixHint}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

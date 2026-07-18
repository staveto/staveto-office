import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminDb, isAdminConfigured } from "@/lib/firebaseAdmin";
import { guardProjectAccess, verifyApiAuth } from "@/lib/apiAuth";
import { defaultLabelForSymbolType } from "@/lib/takeoff/candidateReview";

export const runtime = "nodejs";

const bodySchema = z.object({
  projectId: z.string().min(1),
  symbol_type: z.string().min(1).max(80),
  notes: z.string().max(500).optional(),
});

type RouteParams = { params: Promise<{ candidateId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { candidateId } = await params;
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Admin not configured — use client changeSymbolCandidateType()" },
      { status: 503 }
    );
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const auth = await verifyApiAuth(req);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }
  const denied = await guardProjectAccess(parsed.data.projectId, auth.uid, auth.email);
  if (denied) return denied;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Admin DB unavailable" }, { status: 503 });

  const ref = db
    .collection("projects")
    .doc(parsed.data.projectId)
    .collection("symbolCandidates")
    .doc(candidateId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  const data = snap.data() as Record<string, unknown>;
  const label = defaultLabelForSymbolType(parsed.data.symbol_type);
  const prev = (data.labelSuggestions as Array<{ label: string; confidence: number }>) ?? [];
  const labelSuggestions = [
    { label, confidence: 0.85 },
    ...prev.filter((s) => s.label !== label),
  ].slice(0, 4);
  const status = data.status === "unknown_type" ? "probable" : data.status;
  await ref.update({
    status,
    labelSuggestions,
    metadataSymbolType: parsed.data.symbol_type,
    ...(parsed.data.notes
      ? {
          nearbyText: [data.nearbyText, parsed.data.notes].filter(Boolean).join(" · "),
        }
      : {}),
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, symbol_type: parsed.data.symbol_type, status });
}

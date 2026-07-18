import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminDb, isAdminConfigured } from "@/lib/firebaseAdmin";
import { guardProjectAccess, verifyApiAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

const bodySchema = z.object({
  projectId: z.string().min(1),
});

type RouteParams = { params: Promise<{ candidateId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { candidateId } = await params;
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Admin not configured — use client rejectSymbolCandidate()" },
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
  await ref.update({ status: "rejected", updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, status: "rejected" });
}

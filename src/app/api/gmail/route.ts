import { NextResponse } from "next/server";
import { getAdminDb, isAdminConfigured } from "@/lib/firebaseAdmin";
import { isGmailClientConfigured, isGmailOAuthFullyConfigured } from "@/lib/gmail/config";

async function checkAdminHealthy(): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;
  try {
    await db.doc("organizations/_gmail_health_probe").get();
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const adminConfigured = isAdminConfigured();
  const adminHealthy = adminConfigured ? await checkAdminHealthy() : false;

  return NextResponse.json({
    configured: isGmailClientConfigured(),
    oauthReady: isGmailOAuthFullyConfigured() || !adminHealthy,
    adminConfigured,
    adminHealthy,
    preferCloudGmail: !adminHealthy,
    aiInvoiceOcr: true,
  });
}

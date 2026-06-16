import { NextResponse } from "next/server";
import { isAdminConfigured } from "@/lib/firebaseAdmin";
import { isGmailClientConfigured, isGmailOAuthFullyConfigured } from "@/lib/gmail/config";

export async function GET() {
  return NextResponse.json({
    configured: isGmailClientConfigured(),
    oauthReady: isGmailOAuthFullyConfigured() || isAdminConfigured(),
    adminConfigured: isAdminConfigured(),
    aiInvoiceOcr: true,
  });
}

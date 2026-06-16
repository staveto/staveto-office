import { NextRequest, NextResponse } from "next/server";
import { isGmailClientConfigured } from "@/lib/gmail/config";
import { decodeOAuthState, exchangeCodeForTokens } from "@/lib/gmail/oauth";
import { saveGmailConnection } from "@/lib/gmail/tokenStore";
import { syncGmailInbox } from "@/lib/gmail/syncService";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stateRaw = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const fallback = "/app/settings/app-center?category=communication";

  if (error) {
    return NextResponse.redirect(new URL(`${fallback}&gmail=error`, request.nextUrl.origin));
  }

  if (!code || !stateRaw || !isGmailClientConfigured()) {
    return NextResponse.redirect(new URL(`${fallback}&gmail=missing`, request.nextUrl.origin));
  }

  const state = decodeOAuthState(stateRaw);
  if (!state) {
    return NextResponse.redirect(new URL(`${fallback}&gmail=state`, request.nextUrl.origin));
  }

  try {
    const tokens = await exchangeCodeForTokens(code, request.nextUrl.origin);
    if (!tokens.refreshToken) {
      return NextResponse.redirect(
        new URL(`${state.returnUrl}&gmail=no_refresh`, request.nextUrl.origin)
      );
    }

    await saveGmailConnection(state.orgId, state.uid, {
      email: tokens.email || "gmail@connected",
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    });

    try {
      await syncGmailInbox(state.orgId, state.uid);
    } catch {
      /* sync optional on connect */
    }

    const isPopup = state.returnUrl.includes("oauth_popup=1");
    if (isPopup) {
      const success = new URL("/app/oauth/gmail/success", request.nextUrl.origin);
      success.searchParams.set("oauth_popup", "1");
      if (tokens.email) success.searchParams.set("email", tokens.email);
      const returnBase = state.returnUrl.split("?")[0] || "/app/settings/app-center";
      success.searchParams.set("return", returnBase);
      return NextResponse.redirect(success);
    }

    const dest = state.returnUrl.includes("?")
      ? `${state.returnUrl}&gmail=connected`
      : `${state.returnUrl}?gmail=connected`;
    return NextResponse.redirect(new URL(dest, request.nextUrl.origin));
  } catch (err) {
    console.error("[gmail/oauth/callback]", err);
    const reason =
      err instanceof Error && err.message.includes("token exchange")
        ? "token"
        : err instanceof Error && err.message.includes("ADMIN_NOT_CONFIGURED")
          ? "admin"
          : "failed";
    return NextResponse.redirect(
      new URL(`${fallback}&gmail=${reason}`, request.nextUrl.origin)
    );
  }
}

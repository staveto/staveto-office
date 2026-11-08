import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { APP_ORIGIN, resolveMarketingRequest } from "@/lib/marketingHost";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname, search } = request.nextUrl;
  const action = resolveMarketingRequest(host, pathname);

  if (action.type === "next") return NextResponse.next();

  if (action.type === "redirect-app") {
    return NextResponse.redirect(`${APP_ORIGIN}${action.pathname}${search}`);
  }

  const url = request.nextUrl.clone();
  url.pathname = action.pathname;

  if (action.type === "redirect-public") {
    return NextResponse.redirect(url);
  }

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

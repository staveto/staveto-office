import Link from "next/link";
import { headers } from "next/headers";
import { marketingHref, type MarketingPath } from "@/lib/marketingHost";
import { APP_LOGIN_URL } from "@/lib/marketingLinks";

const NAV: { href: MarketingPath; label: string }[] = [
  { href: "/product", label: "Product" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/pricing", label: "Pricing" },
];

export async function MarketingHeader() {
  const host = (await headers()).get("host") ?? "";

  return (
    <header className="sticky top-0 z-40 border-b border-[#E6EAF0] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href={marketingHref(host, "/")} className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/staveto-logo.png" alt="Staveto" className="h-8 w-auto" />
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#1D376A]">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={marketingHref(host, item.href)}
              className="hover:text-[#e06737]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center rounded-full border border-[#E6EAF0] px-2.5 py-1 text-xs font-semibold text-[#1D376A]">
            EN
          </span>
          <a
            href={APP_LOGIN_URL}
            className="inline-flex size-9 items-center justify-center rounded-full border border-[#E6EAF0] text-[#1D376A] hover:border-[#e06737] hover:text-[#e06737]"
            aria-label="Log in"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="8" r="3.2" />
              <path d="M5 19.2c1.4-3 3.8-4.5 7-4.5s5.6 1.5 7 4.5" strokeLinecap="round" />
            </svg>
          </a>
          <a
            href={APP_LOGIN_URL}
            className="rounded-full bg-[#1D376A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15294f]"
          >
            Log in
          </a>
        </div>
      </div>
      <nav className="flex gap-4 overflow-x-auto border-t border-[#E6EAF0] px-4 py-2 text-sm font-medium text-[#1D376A] md:hidden">
        {NAV.map((item) => (
          <Link key={item.href} href={marketingHref(host, item.href)} className="shrink-0 hover:text-[#e06737]">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

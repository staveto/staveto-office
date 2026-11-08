import Link from "next/link";
import { headers } from "next/headers";
import { marketingHref, type MarketingPath } from "@/lib/marketingHost";
import { APP_LOGIN_URL, SUPPORT_EMAIL } from "@/lib/marketingLinks";

const LEGAL: { href: MarketingPath; label: string }[] = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms-conditions", label: "Terms" },
  { href: "/cookie-policy", label: "Cookies" },
  { href: "/data-processing", label: "Data processing" },
  { href: "/subprocessor", label: "Subprocessors" },
  { href: "/legal", label: "Legal" },
  { href: "/delete-account", label: "Delete account" },
];

export async function MarketingFooter() {
  const host = (await headers()).get("host") ?? "";

  return (
    <footer className="border-t border-[#E6EAF0] bg-[#F7F8FB]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1D376A]">Staveto</p>
          <p className="mt-1 max-w-sm text-sm text-[#64748B]">
            Office and field tools for construction companies.
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-2 inline-block text-sm text-[#e06737] hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#334155]">
          <a href={APP_LOGIN_URL} className="hover:text-[#e06737]">
            Log in
          </a>
          {LEGAL.map((item) => (
            <Link key={item.href} href={marketingHref(host, item.href)} className="hover:text-[#e06737]">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

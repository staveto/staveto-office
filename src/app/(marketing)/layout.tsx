import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

export const metadata: Metadata = {
  title: {
    default: "Staveto",
    template: "%s · Staveto",
  },
  description:
    "Staveto helps construction teams stop losing profit to chaos — office on the web, field apps on Android and iOS.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-[#0F172A]" data-testid="marketing-shell">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

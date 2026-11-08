import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/marketing/ContactForm";
import { LegalPlaceholder } from "@/components/marketing/LegalPlaceholder";
import { APP_LOGIN_URL, APP_REGISTER_URL, SUPPORT_EMAIL } from "@/lib/marketingLinks";

const PAGES = {
  product: {
    title: "Product",
    kind: "product",
  },
  about: {
    title: "About",
    kind: "about",
  },
  contact: {
    title: "Contact",
    kind: "contact",
  },
  pricing: {
    title: "Pricing",
    kind: "pricing",
  },
  privacy: { title: "Privacy policy", kind: "legal" },
  "terms-conditions": { title: "Terms and conditions", kind: "legal" },
  "cookie-policy": { title: "Cookie policy", kind: "legal" },
  "delete-account": { title: "Delete account", kind: "legal" },
  "data-processing": { title: "Data processing", kind: "legal" },
  legal: { title: "Legal", kind: "legal" },
  subprocessor: { title: "Subprocessors", kind: "legal" },
} as const;

type PageSlug = keyof typeof PAGES;

export function generateStaticParams(): { page: PageSlug }[] {
  return (Object.keys(PAGES) as PageSlug[]).map((page) => ({ page }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  const entry = PAGES[page as PageSlug];
  if (!entry) return { title: "Staveto" };
  return { title: entry.title };
}

export default async function MarketingInnerPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const entry = PAGES[page as PageSlug];
  if (!entry) notFound();

  if (entry.kind === "legal") {
    return <LegalPlaceholder title={entry.title} />;
  }

  if (entry.kind === "contact") {
    return (
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold text-[#1D376A]">Contact</h1>
          <p className="mt-4 text-[#334155] leading-relaxed">
            Tell us about the company and what you want to run in Staveto. We reply from{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#e06737] hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <p className="mt-4 text-sm text-[#64748B]">
            Already a customer?{" "}
            <a href={APP_LOGIN_URL} className="font-semibold text-[#e06737] hover:underline">
              Log in to Staveto Office
            </a>
            .
          </p>
        </div>
        <ContactForm />
      </div>
    );
  }

  if (entry.kind === "about") {
    return (
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-bold text-[#1D376A]">About Staveto</h1>
        <p className="mt-4 text-lg leading-relaxed text-[#334155]">
          Staveto is built for construction companies that sell the job in the office and deliver
          it on site. The same account covers quotes, the schedule, and what the crew reports from
          the phone.
        </p>
        <p className="mt-4 leading-relaxed text-[#334155]">
          Staveto Office runs in the browser at app.staveto.com. Android and iOS apps are for the
          field: photos, tasks, and the day on site.
        </p>
      </article>
    );
  }

  if (entry.kind === "pricing") {
    return (
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-bold text-[#1D376A]">Pricing</h1>
        <p className="mt-4 text-lg leading-relaxed text-[#334155]">
          Company plans are managed inside Staveto Office after you sign in. This page does not
          list prices copied from the old site — open the app or write to us and we will confirm
          the current plan.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={APP_REGISTER_URL}
            className="rounded-full bg-[#e06737] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c9582f]"
          >
            Create an account
          </a>
          <a
            href={APP_LOGIN_URL}
            className="rounded-full border border-[#1D376A] px-5 py-2.5 text-sm font-semibold text-[#1D376A] hover:bg-[#F4F7FB]"
          >
            Log in
          </a>
        </div>
      </article>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold text-[#1D376A]">Product</h1>
      <p className="mt-4 text-lg leading-relaxed text-[#334155]">
        One job, from the first quote to handover. The office works in the browser. The site works
        in the app.
      </p>
      <ul className="mt-8 space-y-4 text-[#334155]">
        <li>
          <strong className="text-[#1D376A]">Quotes.</strong> Materials, labour, and a total the
          customer can read.
        </li>
        <li>
          <strong className="text-[#1D376A]">Schedule.</strong> Phases and tasks, including what is
          due today.
        </li>
        <li>
          <strong className="text-[#1D376A]">Team and documents.</strong> Who is on the job, plus
          photos and files from the site.
        </li>
      </ul>
      <a
        href={APP_LOGIN_URL}
        className="mt-8 inline-flex rounded-full bg-[#1D376A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#15294f]"
      >
        Open Staveto Office
      </a>
    </article>
  );
}

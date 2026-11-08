import { SUPPORT_EMAIL } from "@/lib/marketingLinks";

export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold text-[#1D376A]">{title}</h1>
      <p className="mt-4 text-[#334155] leading-relaxed">
        This page is being moved from the previous Staveto website. The full text will be
        published here before the domain switches. Until then, questions go to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#e06737] hover:underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </article>
  );
}

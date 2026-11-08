import type { Metadata } from "next";
import { APP_LOGIN_URL, APP_STORE_URL, GOOGLE_PLAY_URL } from "@/lib/marketingLinks";

export const metadata: Metadata = {
  title: "Stop losing profits to construction chaos",
  description:
    "Staveto Office on the web, plus Android and iOS apps for the site. Quotes, schedule, and the field in one place.",
};

export default function MarketingHomePage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-[#10233f] text-white">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-45"
          style={{ backgroundImage: "url(/images/flyover-site-scene.png)" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#10233f]/40 to-[#10233f]/75" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-4 py-16 text-center sm:py-24">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            Stop Losing <span className="text-[#e06737]">Profits</span> to Construction Chaos.
          </h1>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <a
              href={GOOGLE_PLAY_URL}
              className="inline-flex min-w-[220px] items-center justify-center rounded-full bg-[#e06737] px-6 py-3 text-sm font-semibold text-white hover:bg-[#c9582f]"
            >
              Download Google Play
            </a>
            <a
              href={APP_LOGIN_URL}
              className="inline-flex min-w-[220px] items-center justify-center rounded-md bg-[#d7f5df] px-6 py-3 text-sm font-bold text-[#14532d] hover:bg-[#c6efd2]"
            >
              STAVETO Office
            </a>
            <a
              href={APP_STORE_URL}
              className="inline-flex min-w-[220px] items-center justify-center rounded-full bg-[#3b6fe0] px-6 py-3 text-sm font-semibold text-white hover:bg-[#2f5ec4]"
            >
              Download App Store
            </a>
          </div>
          <p className="mt-4 text-sm text-white/80">
            Office opens at app.staveto.com. The mobile apps are for the site.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-[#111] sm:text-5xl">
          THE HIDDEN COSTS OF{" "}
          <span className="text-[#e06737]">UNMANAGED</span> CONSTRUCTION
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#334155]">
          Missed quotes, unclear schedules, and photos stuck in chat threads quietly eat the job.
          Staveto keeps the office quote, the plan, and the crew on the same job — on the web and
          on the phone.
        </p>
      </section>

      <section className="border-t border-[#E6EAF0] bg-[#F7F8FB]">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-14 sm:grid-cols-3">
          {[
            {
              title: "Quotes that match the site",
              body: "Build the offer from real quantities, then send it from the office.",
            },
            {
              title: "A schedule the crew can see",
              body: "Phases, tasks, and what is due today — not a spreadsheet on one laptop.",
            },
            {
              title: "Field and office together",
              body: "Photos, notes, and updates from Android and iOS land on the same job.",
            },
          ].map((card) => (
            <article key={card.title} className="rounded-2xl border border-[#E6EAF0] bg-white p-5">
              <h3 className="text-lg font-semibold text-[#1D376A]">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#334155]">{card.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

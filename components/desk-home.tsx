import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BAND_LABEL, STATUS_LABEL, formatWhen } from "@/lib/format"
import { SAMPLE_RUN_ID } from "@/lib/ids"
import type { RunSummary } from "@/lib/types"

const STEPS = [
  {
    n: "01",
    source: "Exa",
    title: "Search and enrichment",
    copy: "Finds companies that buy or distribute what the supplier exports, and keeps the page summary plus the passages that mention products, origins, and markets.",
  },
  {
    n: "02",
    source: "Firecrawl",
    title: "Data extraction",
    copy: "Reads each company site and pulls a buyer profile: role, what they buy, where they sell, certifications, and short quotes from the page.",
  },
  {
    n: "03",
    source: "Parallel",
    title: "Market context",
    copy: "One deep-research pass on the shortlist: category outlook in the target markets, competitor suppliers, and a fit note for each lead with citations.",
  },
  {
    n: "04",
    source: "Meridian",
    title: "ICP classification",
    copy: "Scores every lead against this supplier. Points move only when evidence supports them. Exclusions and peer exporters are disqualified even when the wording overlaps.",
  },
]

export function DeskHome({ runs }: { runs: RunSummary[] }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:py-12">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Export sales intelligence
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-[1.05] text-foreground sm:text-5xl">
            Qualify buyers against the supplier you represent.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Describe a supplier and the buyer you want. Meridian searches for companies, reads
            their sites, researches the market and the competitors around them, then scores each
            lead on the evidence.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button className="h-10 px-4" render={<Link href="/qualify" />}>
              New qualification
            </Button>
            <Button
              variant="outline"
              className="h-10 px-4"
              render={<Link href={`/runs/${SAMPLE_RUN_ID}`} />}
            >
              Open the worked example
            </Button>
          </div>
        </div>
        <aside className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Worked example
          </p>
          <p className="mt-2 font-serif text-2xl leading-tight">Serra Alta Exportadora</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Specialty arabica from Minas Gerais. Buyers in Germany, the Netherlands, and Japan.
            The companies, quotes, and citations are sample material so you can read the scoring
            before any API key is connected.
          </p>
        </aside>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((step) => (
          <article key={step.n} className="rounded-xl border border-border bg-card/70 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-serif text-lg">{step.title}</p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {step.n} · {step.source}
              </p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.copy}</p>
          </article>
        ))}
      </section>

      <section>
        <h2 className="font-serif text-2xl">On the desk</h2>
        <ul className="mt-4 grid gap-3">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/runs/${run.id}`}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{run.supplierName}</p>
                    {run.mode === "sample" ? <Badge variant="outline">Sample</Badge> : null}
                    <Badge variant="secondary">{STATUS_LABEL[run.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {run.originCountry} → {run.markets}
                  </p>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{run.products}</p>
                </div>
                <div className="text-sm sm:text-right">
                  {run.topLead ? (
                    <p>
                      <span className={`rounded-full px-2 py-0.5 text-xs band-${run.topLead.band}`}>
                        {BAND_LABEL[run.topLead.band]} {run.topLead.total}
                      </span>
                      <span className="mt-1 block text-muted-foreground">{run.topLead.name}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      {run.leadCount ? `${run.leadCount} leads in progress` : "Pipeline starting"}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{formatWhen(run.createdAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

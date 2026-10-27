import type { Run, RunSummary } from "./types"

export function summarize(run: Run): RunSummary {
  const ranked = [...run.leads].sort(
    (a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0)
  )
  const top = ranked.find((lead) => lead.score && !lead.score.disqualified) ?? ranked[0]
  return {
    id: run.id,
    mode: run.mode,
    status: run.status,
    supplierName: run.brief.supplierName,
    originCountry: run.brief.originCountry,
    markets: run.brief.markets,
    products: run.brief.products,
    createdAt: run.createdAt,
    leadCount: run.leads.length,
    topLead: top?.score
      ? { name: top.name, band: top.score.band, total: top.score.total }
      : undefined,
  }
}

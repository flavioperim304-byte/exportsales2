import type { Extraction, Lead, Run, RunSummary } from "./types"

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

/** Drop page dumps so the buyer list can render without shipping every run verbatim. */
export function boardRun(run: Run): Run {
  return {
    ...run,
    logs: [],
    searchTasks: undefined,
    leads: run.leads.map(boardLead),
  }
}

function boardLead(lead: Lead): Lead {
  return {
    ...lead,
    exa: {
      title: lead.exa?.title || lead.name,
      url: lead.exa?.url || lead.url,
      domain: lead.exa?.domain || lead.domain,
      text: "",
      highlights: [],
      summary: lead.exa?.summary || "",
    },
    extraction: lead.extraction ? boardExtraction(lead.extraction) : undefined,
  }
}

function boardExtraction(extraction: Extraction): Extraction {
  return {
    ...extraction,
    excerpt: "",
    summary: extraction.summary?.slice(0, 400) ?? "",
    buys: extraction.buys?.slice(0, 8) ?? [],
    sells: extraction.sells?.slice(0, 8) ?? [],
    buyerSignals: extraction.buyerSignals?.slice(0, 6) ?? [],
  }
}

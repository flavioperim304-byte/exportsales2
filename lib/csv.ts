import { formatKg, formatUsd, tradeForCountry, yearLabel } from "./comexstat-map"
import type { Brief, Run } from "./types"
import { qualificationRows } from "./qualify"

function cell(value: string): string {
  const text = value.replace(/\r?\n/g, " ").trim()
  if (/[",]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function csvFilename(brief: Brief): string {
  const slug = `${brief.supplierName}-${brief.markets}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${slug || "results"}.csv`
}

function tradeCell(run: Pick<Run, "trade">, country: string): string {
  const series = tradeForCountry(run.trade, country)
  if (!run.trade || !series) return ""
  if (series.error) return series.error
  return series.years
    .map((year) => `${yearLabel(year, run.trade!.periodTo)} ${formatUsd(year.usdFob)} / ${formatKg(year.kg)}`)
    .join("; ")
}

export function resultsCsv(run: Pick<Run, "leads" | "brief" | "also" | "trade">): string {
  const leads = new Map(run.leads.map((lead) => [lead.name, lead]))
  const rows = qualificationRows(run.leads, run.brief, run.also)
  const header = [
    "Company",
    "Country",
    "Role",
    "ICP",
    "Best fit",
    "Activity",
    "Commerce",
    "Trade filing",
    "HS shipments",
    "Last trade",
    "Occupied brands",
    "Fit probability",
    "Fit evidence",
    "Response probability",
    "Response score",
    "Response note",
    "Hiring",
    "Mix change",
    "Social growth",
    "Email",
    "Phone",
    "WhatsApp",
    "Website",
    "Still to confirm",
    "Seed",
    "API Exa",
    "API Firecrawl",
    "Atlas",
    "RAG match",
    "Brazil exports",
  ]
  const lines = rows.map((row) => {
    const lead = leads.get(row.company)
    return [
      row.company,
      row.country,
      lead?.buyerType || "",
      row.level,
      row.bestFit,
      row.activity,
      row.commerce,
      lead?.filing?.note || "",
      lead?.filing ? String(lead.filing.hsShipments) : "",
      lead?.filing?.lastTradeDate?.slice(0, 10) || "",
      lead?.filing?.occupiedBrands.join("; ") || "",
      `${row.fitLevel} ${row.fitIndex}/100`,
      row.fitNote,
      row.responseLevel,
      String(row.responseScore),
      row.responseNote,
      lead?.response?.hiring ? "yes" : "",
      lead?.response?.mixChange ? "yes" : "",
      lead?.response?.socialGrowth ? "yes" : "",
      lead?.extraction?.email || "",
      lead?.extraction?.phone || "",
      lead?.extraction?.whatsapp || "",
      lead?.extraction?.website || lead?.url || "",
      row.qualificationNeeded,
      lead?.seed || "",
      lead?.apiConfirm?.exa || "",
      lead?.apiConfirm?.firecrawl || "",
      lead?.atlas?.status || "",
      lead?.rag?.checked ? (lead.rag.match ? "yes" : "no") : "",
      tradeCell(run, row.country),
    ]
      .map(cell)
      .join(",")
  })
  return `\uFEFF${[header.join(","), ...lines].join("\n")}\n`
}

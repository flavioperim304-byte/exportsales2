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

export function resultsCsv(run: Pick<Run, "leads" | "brief" | "also">): string {
  const leads = new Map(run.leads.map((lead) => [lead.name, lead]))
  const rows = qualificationRows(run.leads, run.brief, run.also)
  const header = [
    "Company",
    "Country",
    "Role",
    "ICP",
    "Best fit",
    "Email",
    "Phone",
    "WhatsApp",
    "Website",
    "Still to confirm",
  ]
  const lines = rows.map((row) => {
    const lead = leads.get(row.company)
    return [
      row.company,
      row.country,
      lead?.buyerType || "",
      row.level,
      row.bestFit,
      lead?.extraction?.email || "",
      lead?.extraction?.phone || "",
      lead?.extraction?.whatsapp || "",
      lead?.extraction?.website || lead?.url || "",
      row.qualificationNeeded,
    ]
      .map(cell)
      .join(",")
  })
  return `\uFEFF${[header.join(","), ...lines].join("\n")}\n`
}

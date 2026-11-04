import crypto from "node:crypto"
import { classifyActivity, mentionsCompany } from "./activity"
import { stampIntelligence } from "./intelligence"
import { clip } from "./text"
import type { ActivityKind, ActivitySignal, Lead, Run } from "./types"

export const TOP_PER_COUNTRY = 3
export const MONITOR_PERIOD = "7d"
export const MONITOR_EVENT = "monitor.run.completed" as const

/** Signal types written into the Exa monitor query. Not a purchase. */
export const MONITOR_SIGNALS = [
  "news",
  "product launches",
  "promotion",
  "exhibitions",
  "events",
  "mentions",
] as const

export type MonitorSignalLabel = (typeof MONITOR_SIGNALS)[number]

export type WatchLead = {
  runId: string
  leadId: string
  name: string
  domain: string
  url: string
  country: string
  rank: number
  responseScore: number
  fitIndex: number
  band?: string
}

const BAND_RANK: Record<string, number> = {
  best_fit: 4,
  strong: 3,
  possible: 2,
  weak: 1,
  disqualified: 0,
}

export const MONITOR_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          quote: { type: "string" },
        },
        required: ["kind", "title", "url"],
      },
    },
  },
  required: ["signals"],
}

export function monitorsCreateAllowed(): boolean {
  if (process.env.ALLOW_EXA_MONITORS === "true") return true
  return process.env.RENDER === "true"
}

export function webhookPublicUrl(): string {
  const explicit = process.env.EXA_WEBHOOK_URL?.trim()
  if (explicit) {
    if (/\/api\/exa\/webhook\/?$/i.test(explicit)) return explicit.replace(/\/$/, "")
    return `${explicit.replace(/\/$/, "")}/api/exa/webhook`
  }
  const origin = (process.env.RENDER_EXTERNAL_URL || "https://exportsales.onrender.com").replace(/\/$/, "")
  return `${origin}/api/exa/webhook`
}

export function watchKey(country: string, domain: string, name: string): string {
  return `${country.trim().toLowerCase()}|${domain.trim().toLowerCase()}|${name.trim().toLowerCase()}`
}

function countryOf(lead: Lead): string {
  return (lead.market || lead.country || "").trim()
}

function rankValue(lead: Lead): { response: number; fit: number; band: number } {
  return {
    response: lead.response?.score ?? -1,
    fit: lead.fit?.index ?? -1,
    band: BAND_RANK[lead.score?.band || ""] ?? 0,
  }
}

function betterLead(left: Lead, right: Lead): Lead {
  const a = rankValue(left)
  const b = rankValue(right)
  if (a.response !== b.response) return a.response > b.response ? left : right
  if (a.fit !== b.fit) return a.fit > b.fit ? left : right
  if (a.band !== b.band) return a.band > b.band ? left : right
  return left.name.localeCompare(right.name) <= 0 ? left : right
}

export function topLeadsByCountry(runs: Run[], limit = TOP_PER_COUNTRY): WatchLead[] {
  const buckets = new Map<string, Map<string, { run: Run; lead: Lead }>>()
  for (const run of runs) {
    if (run.mode === "sample") continue
    for (const lead of run.leads ?? []) {
      if (lead.score?.disqualified) continue
      const country = countryOf(lead)
      if (!country || !lead.name.trim()) continue
      const key = watchKey(country, lead.domain || lead.url, lead.name)
      let byKey = buckets.get(country)
      if (!byKey) {
        byKey = new Map()
        buckets.set(country, byKey)
      }
      const current = byKey.get(key)
      if (!current || betterLead(lead, current.lead) === lead) {
        byKey.set(key, { run, lead })
      }
    }
  }
  const watched: WatchLead[] = []
  const countries = [...buckets.keys()].sort((a, b) => a.localeCompare(b))
  for (const country of countries) {
    const ranked = [...(buckets.get(country)?.values() ?? [])].sort((left, right) => {
      const a = rankValue(left.lead)
      const b = rankValue(right.lead)
      return b.response - a.response || b.fit - a.fit || b.band - a.band || left.lead.name.localeCompare(right.lead.name)
    })
    ranked.slice(0, limit).forEach((row, index) => {
      watched.push({
        runId: row.run.id,
        leadId: row.lead.id,
        name: row.lead.name,
        domain: row.lead.domain || "",
        url: row.lead.url || "",
        country,
        rank: index + 1,
        responseScore: row.lead.response?.score ?? 0,
        fitIndex: row.lead.fit?.index ?? 0,
        band: row.lead.score?.band,
      })
    })
  }
  return watched
}

export function monitorQuery(name: string, country: string): string {
  return [
    `"${name.trim()}"`,
    country.trim(),
    '(news OR "product launch" OR lançamento OR promotion OR promoção OR exhibition OR "trade fair" OR feira OR Cosmoprof OR event OR evento OR mention OR mencionou)',
  ]
    .filter((part) => part.trim())
    .join(" ")
}

export function monitorCreateBody(watch: WatchLead, webhookUrl: string) {
  return {
    name: `Export Desk · ${watch.country} #${watch.rank} · ${watch.name}`.slice(0, 120),
    search: {
      query: monitorQuery(watch.name, watch.country),
      numResults: 10,
      contents: { highlights: true },
    },
    trigger: { type: "interval" as const, period: MONITOR_PERIOD },
    metadata: {
      runId: watch.runId,
      leadId: watch.leadId,
      country: watch.country,
      domain: watch.domain,
    },
    webhook: {
      url: webhookUrl,
      events: [MONITOR_EVENT],
    },
    outputSchema: MONITOR_OUTPUT_SCHEMA,
  }
}

export function verifyExaSignature(payload: string, signatureHeader: string, secret: string): boolean {
  const parts: Record<string, string> = {}
  for (const piece of signatureHeader.split(",")) {
    const splitAt = piece.indexOf("=")
    if (splitAt <= 0) continue
    parts[piece.slice(0, splitAt).trim()] = piece.slice(splitAt + 1).trim()
  }
  const timestamp = parts.t
  const actual = parts.v1
  if (!timestamp || !actual || !secret) return false
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(payload).digest("hex")
  const actualBuffer = Buffer.from(actual, "hex")
  const expectedBuffer = Buffer.from(expected, "hex")
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

const MONITOR_KINDS = new Set<ActivityKind>([
  "news",
  "launch",
  "promotion",
  "exhibition",
  "event",
  "mention",
])

export function normalizeMonitorKind(raw: string): ActivityKind | undefined {
  const value = raw.trim().toLowerCase()
  if (!value) return undefined
  if (value.includes("launch") || value.includes("lanç") || value.includes("lanc")) return "launch"
  if (value.includes("promo")) return "promotion"
  if (value.includes("exhibit") || value.includes("feira") || value.includes("fair") || value.includes("cosmoprof")) {
    return "exhibition"
  }
  if (value.includes("event") || value.includes("evento")) return "event"
  if (value.includes("mention") || value.includes("mencion")) return "mention"
  if (value.includes("news") || value.includes("notíc") || value.includes("noticia")) return "news"
  if (MONITOR_KINDS.has(value as ActivityKind)) return value as ActivityKind
  return undefined
}

type WebhookResult = { title?: unknown; url?: unknown; text?: unknown; highlights?: unknown; publishedDate?: unknown }

function resultUrl(row: WebhookResult): string {
  return typeof row.url === "string" ? row.url.trim() : ""
}

export function signalsFromMonitorOutput(lead: Lead, output: unknown): ActivitySignal[] {
  if (!output || typeof output !== "object") return []
  const record = output as { results?: unknown; content?: unknown }
  const results = Array.isArray(record.results) ? (record.results as WebhookResult[]) : []
  const allowed = new Set(results.map(resultUrl).filter(Boolean).map((url) => url.toLowerCase()))
  const seen = new Set<string>()
  const signals: ActivitySignal[] = []

  const push = (kind: ActivityKind, title: string, url: string, quote: string, publishedAt?: string) => {
    if (!title || !url) return
    if (!allowed.has(url.toLowerCase())) return
    if (!mentionsCompany(lead, title, url, quote)) return
    const key = `${kind}|${url.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    signals.push({ kind, title, url, quote: clip(quote || title, 220), publishedAt })
  }

  let parsed = record.content
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      parsed = undefined
    }
  }
  if (parsed && typeof parsed === "object") {
    const rows = (parsed as { signals?: unknown }).signals
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (!row || typeof row !== "object") continue
        const item = row as Record<string, unknown>
        const url = typeof item.url === "string" ? item.url.trim() : ""
        const title = typeof item.title === "string" ? item.title.trim() : ""
        const quote = typeof item.quote === "string" ? item.quote : title
        const kind = normalizeMonitorKind(typeof item.kind === "string" ? item.kind : "")
        if (!kind) continue
        push(kind, title, url, quote)
      }
    }
  }

  for (const row of results) {
    const url = resultUrl(row)
    const title = typeof row.title === "string" ? row.title.trim() : ""
    const highlights = Array.isArray(row.highlights)
      ? row.highlights.map((part) => (typeof part === "string" ? part : "")).filter(Boolean)
      : []
    const text = typeof row.text === "string" ? row.text : highlights[0] || ""
    if (!url || !title) continue
    push(
      classifyActivity(url, title, text),
      title,
      url,
      highlights[0] || text || title,
      typeof row.publishedDate === "string" ? row.publishedDate : undefined
    )
  }
  return signals.slice(0, 12)
}

export function mergeMonitorSignals(lead: Lead, incoming: ActivitySignal[], fetchedAt: string) {
  const existing = lead.activity?.signals ?? []
  const seen = new Set(existing.map((signal) => `${signal.kind}|${signal.url.toLowerCase()}`))
  const merged = [...existing]
  for (const signal of incoming) {
    const key = `${signal.kind}|${signal.url.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(signal)
  }
  lead.activity = {
    fetchedAt,
    signals: merged.slice(0, 16),
  }
  lead.signalsAt = fetchedAt
}

export function applyMonitorToRun(run: Run, leadId: string, output: unknown, fetchedAt = new Date().toISOString()): number {
  const lead = run.leads.find((row) => row.id === leadId)
  if (!lead) return 0
  const incoming = signalsFromMonitorOutput(lead, output)
  mergeMonitorSignals(lead, incoming, fetchedAt)
  stampIntelligence(run, lead)
  return incoming.length
}

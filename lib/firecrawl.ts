import type { Brief, Extraction } from "./types"
import { requestJson } from "./http"
import { firecrawlPrompt } from "./prompts"
import { asString, asStringArray, clip } from "./text"

const SCHEMA = {
  type: "object",
  properties: {
    companyName: { type: "string" },
    headquarters: { type: "string" },
    country: { type: "string" },
    role: {
      type: "string",
      description:
        "importer, distributor, wholesaler, trader, roaster, retailer, producer, exporter, or other",
    },
    buys: { type: "array", items: { type: "string" } },
    sells: { type: "array", items: { type: "string" } },
    markets: { type: "array", items: { type: "string" } },
    certifications: { type: "array", items: { type: "string" } },
    buyerSignals: {
      type: "array",
      items: { type: "string" },
      description: "Short phrases from the page about buying, importing, or distribution",
    },
    lastPurchase: {
      type: "string",
      description: "Last inbound purchase or shipment, only if the page states it. Empty otherwise.",
    },
    stock: {
      type: "string",
      description: "Stock or restock language, only if the page states it. Empty otherwise.",
    },
    brandPerformance: {
      type: "string",
      description: "How current brands are performing, only if the page states it. Empty otherwise.",
    },
    salesNote: {
      type: "string",
      description: "Published sales or volume, with the year if given. Empty when unpublished.",
    },
    competitorMoves: {
      type: "array",
      items: { type: "string" },
      description: "Competitor launches, lost brands, or exclusive moves named on the page.",
    },
    summary: { type: "string" },
    email: { type: "string", description: "Published email. Empty when none is published." },
    phone: { type: "string", description: "Published phone. Empty when none is published." },
    whatsapp: { type: "string", description: "Published WhatsApp number. Empty when none is published." },
    website: { type: "string", description: "Company website." },
  },
}

function empty(error: string): Extraction {
  return {
    ok: false,
    error,
    companyName: "",
    headquarters: "",
    country: "",
    role: "",
    buys: [],
    sells: [],
    markets: [],
    certifications: [],
    buyerSignals: [],
    lastPurchase: "",
    stock: "",
    brandPerformance: "",
    salesNote: "",
    competitorMoves: [],
    summary: "",
    excerpt: "",
    email: "",
    phone: "",
    whatsapp: "",
    website: "",
  }
}

export function failedExtraction(error: string): Extraction {
  return empty(error)
}

function contacts(json: Record<string, unknown>) {
  return {
    email: asString(json.email),
    phone: asString(json.phone),
    whatsapp: asString(json.whatsapp || json.whatsApp),
    website: asString(json.website),
  }
}

export function profileFromAgent(data: unknown): Extraction | null {
  if (!data || typeof data !== "object") return null
  const root = data as { data?: unknown; json?: unknown }
  const payload = (root.data ?? root.json ?? data) as Record<string, unknown>
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const summary = asString(payload.summary)
  const companyName = asString(payload.companyName)
  if (!summary && !companyName && !asString(payload.role)) return null
  return {
    ok: true,
    companyName,
    headquarters: asString(payload.headquarters),
    country: asString(payload.country),
    role: asString(payload.role),
    buys: asStringArray(payload.buys).slice(0, 8),
    sells: asStringArray(payload.sells).slice(0, 8),
    markets: asStringArray(payload.markets).slice(0, 8),
    certifications: asStringArray(payload.certifications).slice(0, 8),
    buyerSignals: asStringArray(payload.buyerSignals).slice(0, 4),
    lastPurchase: asString(payload.lastPurchase),
    stock: asString(payload.stock),
    brandPerformance: asString(payload.brandPerformance),
    salesNote: asString(payload.salesNote),
    competitorMoves: asStringArray(payload.competitorMoves).slice(0, 4),
    summary,
    excerpt: clip(summary, 1600),
    ...contacts(payload),
  }
}

export const EXTRACT_PAGE_MS = 70_000
export const EXTRACT_STAGE_MS = 8 * 60 * 1000
export const EXTRACT_POLL_MS = 4_000

const TIMEOUT_MESSAGE = "Firecrawl took too long. Scoring uses the Exa excerpt."

export function jobTimedOut(startedAt: string | undefined, now = Date.now(), limit = EXTRACT_PAGE_MS): boolean {
  if (!startedAt) return false
  const started = Date.parse(startedAt)
  return Number.isFinite(started) && now - started >= limit
}

export function stageTimedOut(startedAt: string | undefined, now = Date.now()): boolean {
  return jobTimedOut(startedAt, now, EXTRACT_STAGE_MS)
}

function agentStatus(data: unknown): string {
  return String(((data ?? {}) as { status?: string }).status ?? "").toLowerCase()
}

function agentSettled(data: unknown): boolean {
  const status = agentStatus(data)
  return status === "completed" || status === "failed" || status === "cancelled" || status === "canceled"
}

async function agentResult(key: string, started: unknown): Promise<unknown> {
  const record = (started ?? {}) as { id?: string; status?: string; data?: unknown }
  if (record.status === "completed" && record.data) return started
  const id = record.id
  if (!id) return started
  const deadline = Date.now() + 55_000
  let latest: unknown = started
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, EXTRACT_POLL_MS))
    latest = await requestJson(`https://api.firecrawl.dev/v2/agent/${id}`, {
      method: "GET",
      timeoutMs: 20000,
      headers: { Authorization: `Bearer ${key}` },
    })
    if (agentSettled(latest)) return latest
  }
  return latest
}

function profileFromScrape(data: unknown): Extraction | null {
  if (!data || typeof data !== "object") return null
  const record = data as { data?: Record<string, unknown>; json?: unknown }
  const inner = record.data && typeof record.data === "object" ? record.data : (data as Record<string, unknown>)
  return (
    profileFromAgent({ data: inner.json ?? inner.extract ?? inner }) ||
    profileFromAgent({ data: record.json }) ||
    profileFromAgent(data)
  )
}

export async function extractPage(
  url: string,
  brief: Brief,
  key: string,
  country = "",
  buyerType = ""
): Promise<Extraction> {
  if (!/^https?:\/\//i.test(url)) {
    return empty("The lead has no http(s) page to read.")
  }

  const prompt = firecrawlPrompt(brief, country, buyerType)

  const started = await requestJson("https://api.firecrawl.dev/v2/agent", {
    method: "POST",
    timeoutMs: 25000,
    headers: { Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      urls: [url],
      prompt,
      model: "spark-2",
      maxCredits: 20,
      schema: SCHEMA,
    }),
  })

  const data = await agentResult(key, started)
  const fromAgent = extractionFromAgent(data, url)
  if (fromAgent.ok || (fromAgent.error && !fromAgent.error.includes("neither a profile"))) {
    if (fromAgent.ok) return fromAgent
    if (agentSettled(data)) return fromAgent
  }
  const scraped = await scrapeProfile(url, brief, key, country, buyerType)
  if (scraped.ok) return scraped
  if (!agentSettled(data)) return empty(TIMEOUT_MESSAGE)
  return fromAgent.error ? fromAgent : scraped
}

function extractionFromAgent(data: unknown, pageUrl: string): Extraction {
  if (!data || typeof data !== "object") return empty("Firecrawl Agent returned an empty body.")
  const record = data as { success?: boolean; status?: string; error?: string; data?: unknown }
  const status = agentStatus(data)
  if (record.success === false || status === "failed" || status === "cancelled" || status === "canceled") {
    return empty(record.error || "Firecrawl Agent could not read this company.")
  }
  const profile = profileFromAgent(record.data ? { data: record.data } : data)
  if (!profile) return empty("Firecrawl Agent returned neither a profile nor contacts.")
  if (!profile.website) profile.website = pageUrl
  return profile
}

export async function scrapeProfile(
  url: string,
  brief: Brief,
  key: string,
  country = "",
  buyerType = ""
): Promise<Extraction> {
  if (!/^https?:\/\//i.test(url)) {
    return empty("The lead has no http(s) page to read.")
  }
  try {
    const data = await requestJson("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      timeoutMs: 25000,
      headers: { Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        url,
        formats: [
          {
            type: "json",
            prompt: firecrawlPrompt(brief, country, buyerType),
            schema: SCHEMA,
          },
        ],
      }),
    })
    const profile = profileFromScrape(data)
    if (!profile) return empty("Firecrawl scrape returned neither a profile nor contacts.")
    if (!profile.website) profile.website = url
    return profile
  } catch (error) {
    return empty(error instanceof Error ? error.message : "Firecrawl scrape failed.")
  }
}

export async function startExtractJob(
  url: string,
  brief: Brief,
  key: string,
  country = "",
  buyerType = ""
): Promise<string> {
  const started = await requestJson("https://api.firecrawl.dev/v2/agent", {
    method: "POST",
    timeoutMs: 20000,
    headers: { Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      urls: [url],
      prompt: firecrawlPrompt(brief, country, buyerType),
      model: "spark-2",
      maxCredits: 20,
      schema: SCHEMA,
    }),
  })
  const id = asString((started as { id?: unknown } | null)?.id)
  if (!id) throw new Error("Firecrawl Agent did not return an id.")
  return id
}

export async function pollExtractJob(
  key: string,
  id: string,
  pageUrl: string
): Promise<{ pending: true } | { pending: false; extraction: Extraction }> {
  const latest = await requestJson(`https://api.firecrawl.dev/v2/agent/${id}`, {
    method: "GET",
    timeoutMs: 20000,
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!agentSettled(latest)) return { pending: true }
  return { pending: false, extraction: extractionFromAgent(latest, pageUrl) }
}

export function timedOutExtraction(): Extraction {
  return empty(TIMEOUT_MESSAGE)
}

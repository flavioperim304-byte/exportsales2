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
    summary,
    excerpt: clip(summary, 1600),
    ...contacts(payload),
  }
}

async function agentResult(key: string, started: unknown): Promise<unknown> {
  const record = (started ?? {}) as { id?: string; status?: string; data?: unknown }
  if (record.status === "completed" && record.data) return started
  const id = record.id
  if (!id) return started
  const deadline = Date.now() + 3 * 60 * 1000
  let latest: unknown = started
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    latest = await requestJson(`https://api.firecrawl.dev/v2/agent/${id}`, {
      method: "GET",
      timeoutMs: 30000,
      headers: { Authorization: `Bearer ${key}` },
    })
    const status = ((latest ?? {}) as { status?: string }).status
    if (status === "completed" || status === "failed") return latest
  }
  return latest
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
    timeoutMs: 120000,
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
  if (!data || typeof data !== "object") return empty("Firecrawl Agent returned an empty body.")
  const record = data as { success?: boolean; status?: string; error?: string; data?: unknown }
  if (record.success === false || record.status === "failed") {
    return empty(record.error || "Firecrawl Agent could not read this company.")
  }
  const profile = profileFromAgent(record.data ? { data: record.data } : data)
  if (!profile) return empty("Firecrawl Agent returned neither a profile nor contacts.")
  if (!profile.website) profile.website = url
  return profile
}

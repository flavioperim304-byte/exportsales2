import type { Brief, Extraction } from "./types"
import { requestJson } from "./http"
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
  }
}

export async function extractPage(
  url: string,
  brief: Brief,
  key: string
): Promise<Extraction> {
  if (!/^https?:\/\//i.test(url)) {
    return empty("The lead has no http(s) page to read.")
  }

  const prompt = [
    "Extract a buyer profile for an export salesperson.",
    `Supplier origin: ${brief.originCountry}.`,
    `Products: ${brief.products}.`,
    `Target markets: ${brief.markets}.`,
    "Use only facts stated on the page. Unknown fields stay empty.",
    "buyerSignals must be short phrases that appear on the page.",
  ].join(" ")

  const data = await requestJson("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    timeoutMs: 90000,
    headers: { Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      timeout: 75000,
      formats: ["markdown", { type: "json", prompt, schema: SCHEMA }],
    }),
  })

  if (!data || typeof data !== "object") return empty("Firecrawl returned an empty body.")
  const record = data as { success?: boolean; data?: Record<string, unknown>; error?: string }
  if (record.success === false) {
    return empty(record.error || "Firecrawl could not read this page.")
  }
  const payload = record.data ?? (record as Record<string, unknown>)
  const markdown = asString(payload.markdown)
  const json = (payload.json ?? payload.extract ?? {}) as Record<string, unknown>
  const summary = asString(json.summary)
  if (!markdown && !summary) {
    return empty("Firecrawl returned neither page text nor a profile.")
  }

  return {
    ok: true,
    companyName: asString(json.companyName),
    headquarters: asString(json.headquarters),
    country: asString(json.country),
    role: asString(json.role),
    buys: asStringArray(json.buys).slice(0, 8),
    sells: asStringArray(json.sells).slice(0, 8),
    markets: asStringArray(json.markets).slice(0, 8),
    certifications: asStringArray(json.certifications).slice(0, 8),
    buyerSignals: asStringArray(json.buyerSignals).slice(0, 4),
    summary,
    excerpt: clip(markdown || summary, 1600),
  }
}

import type { Brief, Lead } from "./types"
import { ApiError, requestJson } from "./http"
import { exaBackupQuery, exaQuery, LEADS_PER_COUNTRY, targetCountries } from "./prompts"
import { clip, domainOf, sameSite } from "./text"

type ExaResult = {
  title?: string
  url?: string
  publishedDate?: string
  text?: string
  highlights?: unknown
  summary?: unknown
  entities?: { properties?: { name?: string } }[]
}

const SOCIAL = /linkedin\.com|facebook\.com|instagram\.com|wikipedia\.org|youtube\.com/i

function summaryText(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text
    return typeof text === "string" ? text.trim() : ""
  }
  return ""
}

function highlightsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 4)
}

function companyName(result: ExaResult): string {
  const entity = result.entities?.find((item) => item.properties?.name)?.properties?.name
  if (entity && entity.trim()) return entity.trim().slice(0, 80)
  const title = (result.title ?? "").split("|")[0]?.trim() ?? ""
  const head = title.split(/\s+[–—-]\s+/)[0]?.trim() ?? ""
  if (head) return head.slice(0, 80)
  return domainOf(result.url ?? "") || "Untitled company"
}

function toLead(result: ExaResult): Lead | null {
  const url = (result.url ?? "").trim()
  if (!/^https?:\/\//i.test(url)) return null
  const domain = domainOf(url)
  if (!domain) return null
  const text = (result.text ?? "").trim()
  const summary = summaryText(result.summary)
  const highlights = highlightsOf(result.highlights)
  return {
    id: crypto.randomUUID(),
    name: companyName(result),
    domain,
    url,
    country: "",
    exa: {
      title: result.title?.trim() || companyName(result),
      url,
      domain,
      publishedDate: result.publishedDate,
      text,
      highlights,
      summary,
    },
  }
}

async function searchOnce(
  key: string,
  body: Record<string, unknown>
): Promise<ExaResult[]> {
  const data = await requestJson("https://api.exa.ai/search", {
    method: "POST",
    timeoutMs: 50000,
    headers: { "x-api-key": key },
    body: JSON.stringify(body),
  })
  if (!data || typeof data !== "object") return []
  const results = (data as { results?: unknown }).results
  return Array.isArray(results) ? (results as ExaResult[]) : []
}

function contents(brief: Brief) {
  return {
    text: { maxCharacters: 2200, verbosity: "compact" },
    highlights: {
      query: `Passages that say what this company buys, imports, or distributes, and which countries it operates in. Products of interest: ${clip(brief.products, 240)}`,
    },
    summary: {
      query:
        "In two sentences, who is this company, what do they buy or distribute, and where do they sell?",
    },
  }
}

function acceptResults(
  results: ExaResult[],
  brief: Brief,
  country: string,
  seen: Set<string>
): Lead[] {
  const local = new Set(seen)
  const leads: Lead[] = []
  for (const result of results) {
    const lead = toLead(result)
    if (!lead) continue
    if (brief.website && sameSite(brief.website, lead.url)) continue
    if (local.has(lead.domain)) continue
    local.add(lead.domain)
    lead.market = country
    leads.push(lead)
  }
  const ownSites = leads.filter((lead) => !SOCIAL.test(lead.domain))
  const social = leads.filter((lead) => SOCIAL.test(lead.domain))
  return [...ownSites, ...social]
}

async function searchCountry(
  brief: Brief,
  key: string,
  country: string,
  seen: Set<string>
): Promise<Lead[]> {
  const query = exaQuery(brief, country)
  const body = {
    query,
    type: "auto",
    category: "company",
    numResults: LEADS_PER_COUNTRY + 8,
    contents: contents(brief),
  }
  let results: ExaResult[]
  try {
    results = await searchOnce(key, body)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 400) throw error
    results = await searchOnce(key, {
      query,
      type: "auto",
      category: "company",
      numResults: LEADS_PER_COUNTRY + 8,
      contents: { text: { maxCharacters: 2200 }, highlights: true },
    })
  }

  let leads = acceptResults(results, brief, country, seen)
  if (leads.length < LEADS_PER_COUNTRY) {
    const extra = await searchOnce(key, {
      query: exaBackupQuery(brief, country),
      type: "auto",
      numResults: LEADS_PER_COUNTRY,
      contents: { text: { maxCharacters: 1800 }, highlights: true },
    }).catch(() => [] as ExaResult[])
    const more = acceptResults(extra, brief, country, new Set([...seen, ...leads.map((lead) => lead.domain)]))
    leads = [...leads, ...more]
  }
  return leads.slice(0, LEADS_PER_COUNTRY)
}

export async function searchLeads(brief: Brief, key: string): Promise<Lead[]> {
  const countries = targetCountries(brief)
  const targets = countries.length ? countries : [brief.markets.trim() || "the target market"]
  const seen = new Set<string>()
  const leads: Lead[] = []
  for (const country of targets) {
    const found = await searchCountry(brief, key, country, seen)
    for (const lead of found) {
      seen.add(lead.domain)
      leads.push(lead)
    }
  }
  return leads
}

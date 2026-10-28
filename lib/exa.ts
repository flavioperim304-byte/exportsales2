import type { Brief, Lead } from "./types"
import { ApiError, requestJson } from "./http"
import {
  buyerTypes,
  competitorQuery,
  competitorSystemPrompt,
  exaBackupQuery,
  exaQuery,
  exaSystemPrompt,
  LEADS_PER_COUNTRY,
  searchBrief,
  targetCountries,
} from "./prompts"
import { countryIsExcluded, fitsRequestedMarket } from "./score"
import { asString, domainOf, sameSite } from "./text"

const SOCIAL = /linkedin\.com|facebook\.com|instagram\.com|wikipedia\.org|youtube\.com/i

const COMPANY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    companies: {
      type: "array",
      maxItems: LEADS_PER_COUNTRY,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          website: { type: "string" },
          country: { type: "string" },
          role: { type: "string" },
          why: { type: "string" },
        },
        required: ["name", "website", "country", "why"],
      },
    },
  },
  required: ["companies"],
}

function exaHeaders(key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, "x-api-key": key }
}

export type AgentCompany = { name: string; website: string; country: string; why: string; role: string }

export function companiesFromAgent(data: unknown): AgentCompany[] {
  if (!data || typeof data !== "object") return []
  const output = (data as { output?: { structured?: unknown } }).output
  const structured = output?.structured
  const record =
    structured && typeof structured === "object" && !Array.isArray(structured)
      ? (structured as Record<string, unknown>)
      : {}
  const list = Array.isArray(record.companies)
    ? record.companies
    : Array.isArray(structured)
      ? structured
      : []
  return list
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>
      return {
        name: asString(row.name),
        website: asString(row.website || row.url),
        country: asString(row.country),
        why: asString(row.why),
        role: asString(row.role),
      }
    })
    .filter((item) => item.name && item.website)
}

async function runAgentSearch(
  key: string,
  query: string,
  websites: string[],
  options?: {
    effort?: string
    systemPrompt?: string
    schema?: unknown
    budget?: { maxCostDollars: number; maxDurationSeconds: number }
    waitMs?: number
  }
): Promise<AgentCompany[]> {
  const created = await requestJson("https://api.exa.ai/agent/runs", {
    method: "POST",
    timeoutMs: 40000,
    headers: exaHeaders(key),
    body: JSON.stringify({
      query,
      systemPrompt: options?.systemPrompt ?? exaSystemPrompt(),
      effort: options?.effort ?? "medium",
      outputSchema: options?.schema ?? COMPANY_SCHEMA,
      budget: options?.budget,
      input: websites.length
        ? { exclusion: websites.map((website) => ({ website })) }
        : undefined,
    }),
  })
  const id = asString((created as { id?: unknown } | null)?.id)
  if (!id) throw new ApiError("Exa Agent did not return a run id.", 502)
  const deadline = Date.now() + (options?.waitMs ?? 4 * 60 * 1000)
  let latest: unknown = created
  while (Date.now() < deadline) {
    const status = asString((latest as { status?: unknown } | null)?.status).toLowerCase()
    if (status === "completed") return companiesFromAgent(latest)
    if (status === "failed" || status === "cancelled") {
      throw new ApiError("Exa Agent search failed.", 502)
    }
    await new Promise((resolve) => setTimeout(resolve, 4000))
    latest = await requestJson(`https://api.exa.ai/agent/runs/${id}`, {
      method: "GET",
      timeoutMs: 30000,
      headers: exaHeaders(key),
    })
  }
  const minutes = Math.round((options?.waitMs ?? 4 * 60 * 1000) / 60000)
  throw new ApiError(`Exa Agent is still searching after ${minutes} minutes.`, 408)
}

function websiteUrl(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`
  return ""
}

function companyToLead(company: AgentCompany): Lead | null {
  const url = websiteUrl(company.website)
  if (!url) return null
  const domain = domainOf(url)
  if (!domain) return null
  const name = company.name.trim().slice(0, 80) || domain
  return {
    id: crypto.randomUUID(),
    name,
    domain,
    url,
    country: company.country,
    exa: {
      title: name,
      url,
      domain,
      text: "",
      highlights: [],
      summary: company.why,
    },
  }
}

function namesSupplier(name: string, suppliers: string[]): boolean {
  const folded = name.toLowerCase()
  return suppliers.some((supplier) => {
    const token = supplier.toLowerCase().trim()
    if (token.length < 4) return false
    return folded === token || folded.startsWith(`${token} `) || folded.includes(` ${token}`)
  })
}

function acceptCompanies(
  companies: AgentCompany[],
  country: string,
  seen: Set<string>,
  websites: string[],
  buyerType = "",
  suppliers: string[] = []
): { leads: Lead[]; outside: number } {
  const local = new Set(seen)
  const leads: Lead[] = []
  let outside = 0
  for (const company of companies) {
    const lead = companyToLead(company)
    if (!lead) continue
    if (websites.some((site) => sameSite(site, lead.url))) continue
    if (namesSupplier(lead.name, suppliers)) continue
    if (!fitsRequestedMarket(country, company.country, lead.domain)) {
      outside += 1
      continue
    }
    if (local.has(lead.domain)) continue
    local.add(lead.domain)
    lead.market = country
    lead.buyerType = buyerType
    leads.push(lead)
  }
  const ownSites = leads.filter((lead) => !SOCIAL.test(lead.domain))
  const social = leads.filter((lead) => SOCIAL.test(lead.domain))
  return { leads: [...ownSites, ...social], outside }
}

function mixTypes(groups: Lead[][]): Lead[] {
  const mixed: Lead[] = []
  const cursors = groups.map(() => 0)
  while (mixed.length < LEADS_PER_COUNTRY) {
    let added = false
    for (let index = 0; index < groups.length; index += 1) {
      const cursor = cursors[index]
      const lead = groups[index][cursor]
      if (!lead) continue
      cursors[index] = cursor + 1
      mixed.push(lead)
      added = true
      if (mixed.length >= LEADS_PER_COUNTRY) break
    }
    if (!added) break
  }
  return mixed
}

async function searchCountry(
  brief: Brief,
  key: string,
  country: string,
  seen: Set<string>,
  websites: string[],
  suppliers: string[]
): Promise<{ leads: Lead[]; outside: number }> {
  const types = buyerTypes(brief)
  const wanted = types.length ? types : [""]
  const groups: Lead[][] = []
  const found = new Set(seen)
  let outside = 0
  for (const type of wanted) {
    const companies = await runAgentSearch(
      key,
      type ? exaQuery(brief, country, type) : exaQuery(brief, country),
      websites
    )
    const accepted = acceptCompanies(companies, country, found, websites, type, suppliers)
    outside += accepted.outside
    for (const lead of accepted.leads) found.add(lead.domain)
    groups.push(accepted.leads)
  }
  let leads = mixTypes(groups)
  if (leads.length < LEADS_PER_COUNTRY) {
    const taken = new Set([...seen, ...leads.map((lead) => lead.domain)])
    for (const type of wanted) {
      if (leads.length >= LEADS_PER_COUNTRY) break
      const extra = await runAgentSearch(
        key,
        exaBackupQuery(brief, country, type || undefined),
        websites
      ).catch(() => [] as AgentCompany[])
      const more = acceptCompanies(extra, country, taken, websites, type, suppliers)
      outside += more.outside
      for (const lead of more.leads) taken.add(lead.domain)
      leads = [...leads, ...more.leads]
    }
  }
  return { leads: leads.slice(0, LEADS_PER_COUNTRY), outside }
}

const COMPETITOR_SCHEMA = {
  ...COMPANY_SCHEMA,
  properties: {
    companies: {
      ...COMPANY_SCHEMA.properties.companies,
      maxItems: 24,
      items: {
        ...COMPANY_SCHEMA.properties.companies.items,
        required: ["name", "website", "country", "role", "why"],
      },
    },
  },
}

async function runDeepSearch(key: string, query: string): Promise<AgentCompany[]> {
  const data = await requestJson("https://api.exa.ai/search", {
    method: "POST",
    timeoutMs: 90000,
    headers: exaHeaders(key),
    body: JSON.stringify({
      query,
      type: "deep",
      numResults: 12,
      contents: { highlights: { maxCharacters: 1500 } },
    }),
  })
  const results = Array.isArray((data as { results?: unknown } | null)?.results)
    ? (data as { results: unknown[] }).results
    : []
  return results
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>
      const highlights = Array.isArray(row.highlights)
        ? row.highlights.filter((part): part is string => typeof part === "string")
        : []
      return {
        name: asString(row.title),
        website: asString(row.url),
        country: "",
        why: highlights[0] || asString(row.text),
        role: "",
      }
    })
    .filter((item) => item.name && item.website)
}

async function searchCompetitors(
  brief: Brief,
  key: string,
  websites: string[]
): Promise<{ leads: Lead[]; outside: number }> {
  const query = competitorQuery(brief)
  const companies =
    brief.exaEffort === "deep"
      ? await runDeepSearch(key, query)
      : await runAgentSearch(key, query, websites, {
          effort: "ultra",
          systemPrompt: competitorSystemPrompt(),
          schema: COMPETITOR_SCHEMA,
          budget: { maxCostDollars: 8, maxDurationSeconds: 900 },
          waitMs: 16 * 60 * 1000,
        })
  const seen = new Set<string>()
  const leads: Lead[] = []
  let outside = 0
  for (const company of companies) {
    const lead = companyToLead({ ...company, role: company.role })
    if (!lead) continue
    if (websites.some((site) => sameSite(site, lead.url))) continue
    if (countryIsExcluded(company.country, lead.domain, brief.excludedMarkets ?? "")) {
      outside += 1
      continue
    }
    if (seen.has(lead.domain)) continue
    seen.add(lead.domain)
    lead.market = company.country || "Unassigned"
    lead.buyerType = company.role
    leads.push(lead)
  }
  return { leads: leads.slice(0, 24), outside }
}

export async function searchLeads(
  brief: Brief,
  key: string,
  also?: Brief
): Promise<{ leads: Lead[]; outside: number }> {
  const queryBrief = searchBrief(brief, also)
  const websites = [brief.website, also?.website].filter((site): site is string => Boolean(site))
  if (queryBrief.searchKind === "competitors") {
    return searchCompetitors(queryBrief, key, websites)
  }
  const suppliers = [brief.supplierName, also?.supplierName].filter((name): name is string =>
    Boolean(name)
  )
  const countries = targetCountries(queryBrief)
  const targets = countries.length ? countries : [queryBrief.markets.trim() || "the target market"]
  const seen = new Set<string>()
  const leads: Lead[] = []
  let outside = 0
  for (const country of targets) {
    const found = await searchCountry(queryBrief, key, country, seen, websites, suppliers)
    outside += found.outside
    for (const lead of found.leads) {
      seen.add(lead.domain)
      leads.push(lead)
    }
  }
  return { leads, outside }
}

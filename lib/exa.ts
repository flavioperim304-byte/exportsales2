import type { Brief, Lead } from "./types"
import { ApiError, requestJson } from "./http"
import {
  buyerTypes,
  exaBackupQuery,
  exaQuery,
  exaSystemPrompt,
  LEADS_PER_COUNTRY,
  searchBrief,
  targetCountries,
} from "./prompts"
import { fitsRequestedMarket } from "./score"
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

export type AgentCompany = { name: string; website: string; country: string; why: string }

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
      }
    })
    .filter((item) => item.name && item.website)
}

async function runAgentSearch(key: string, query: string, websites: string[]): Promise<AgentCompany[]> {
  const created = await requestJson("https://api.exa.ai/agent/runs", {
    method: "POST",
    timeoutMs: 40000,
    headers: exaHeaders(key),
    body: JSON.stringify({
      query,
      systemPrompt: exaSystemPrompt(),
      effort: "medium",
      outputSchema: COMPANY_SCHEMA,
      input: websites.length
        ? { exclusion: websites.map((website) => ({ website })) }
        : undefined,
    }),
  })
  const id = asString((created as { id?: unknown } | null)?.id)
  if (!id) throw new ApiError("Exa Agent did not return a run id.", 502)
  const deadline = Date.now() + 4 * 60 * 1000
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
  throw new ApiError("Exa Agent is still searching after 4 minutes.", 408)
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

export async function searchLeads(
  brief: Brief,
  key: string,
  also?: Brief
): Promise<{ leads: Lead[]; outside: number }> {
  const queryBrief = searchBrief(brief, also)
  const websites = [brief.website, also?.website].filter((site): site is string => Boolean(site))
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

import { createAtlasClient, ensureAtlasToken } from "./atlas-client"
import {
  applyAtlasToLead,
  atlasLookupKey,
  atlasRejectedReason,
  emptyAtlasLookup,
  enrichDumpWithAtlas,
  extraAtlasNames,
  type AtlasLookup,
} from "./company-atlas"
import {
  blankApiConfirm,
  blockedImporterName,
  candidatesForBrief,
  dumpConfirmQuery,
  dumpSimilarQuery,
  dumpSimilarSystemPrompt,
  MAX_SIMILAR_PER_COUNTRY,
  pickExaConfirmation,
  similarHitAllowed,
  type ExaWebHit,
} from "./confirm"
import { pollAgentRun, startAgentRun } from "./exa"
import { requestJson } from "./http"
import { applyFilingToLead } from "./trade-records"
import { asString, domainOf, sameSite } from "./text"
import type { Brief, Lead, RejectedSeed, TradeFiling } from "./types"

const SIMILAR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    companies: {
      type: "array",
      maxItems: 8,
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

function websiteUrl(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`
  return ""
}

async function namedSearch(key: string, query: string): Promise<ExaWebHit[]> {
  const data = await requestJson("https://api.exa.ai/search", {
    method: "POST",
    timeoutMs: 40000,
    headers: exaHeaders(key),
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: 8,
      contents: {
        text: { maxCharacters: 400 },
        highlights: { maxHighlights: 2, maxCharacters: 220 },
      },
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
        title: asString(row.title),
        url: asString(row.url),
        text: highlights.join(" ") || asString(row.text),
      }
    })
    .filter((item) => item.title && item.url)
}

function leadFromHit(
  name: string,
  country: string,
  hit: ExaWebHit,
  seed: Lead["seed"],
  note: string,
  buyerType = "importer"
): Lead | null {
  const url = websiteUrl(hit.url)
  if (!url) return null
  const domain = domainOf(url)
  if (!domain) return null
  if (blockedImporterName(name) || blockedImporterName(hit.title)) return null
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 80) || domain,
    domain,
    url,
    country,
    market: country,
    buyerType,
    seed,
    apiConfirm: {
      ...blankApiConfirm(seed),
      exa: "confirmed",
      note,
    },
    exa: {
      title: hit.title || name,
      url,
      domain,
      text: hit.text,
      highlights: [],
      summary: note,
    },
  }
}

async function confirmOne(
  filing: TradeFiling,
  brief: Brief,
  key: string,
  seen: Set<string>,
  websites: string[]
): Promise<{ lead?: Lead; rejected?: RejectedSeed }> {
  const products = brief.products.trim() || "hair care, shampoo, cosmetics"
  const hits = await namedSearch(key, dumpConfirmQuery(filing.importer, filing.country, products))
  const picked = pickExaConfirmation(filing, hits)
  if (picked.status !== "confirmed" || !picked.hit) {
    return {
      rejected: {
        importer: filing.importer,
        country: filing.country,
        reason: picked.reason,
      },
    }
  }
  const lead = leadFromHit(
    filing.importer,
    filing.country,
    picked.hit,
    "dump",
    picked.reason
  )
  if (!lead) {
    return {
      rejected: {
        importer: filing.importer,
        country: filing.country,
        reason: "Exa devolveu um site que o desk não aceita.",
      },
    }
  }
  if (websites.some((site) => sameSite(site, lead.url))) {
    return {
      rejected: {
        importer: filing.importer,
        country: filing.country,
        reason: "O site é o do próprio fornecedor.",
      },
    }
  }
  if (seen.has(lead.domain)) {
    return {
      rejected: {
        importer: filing.importer,
        country: filing.country,
        reason: "Empresa já confirmada neste run.",
      },
    }
  }
  applyFilingToLead(lead, [filing], brief)
  return { lead }
}

async function similarInCountry(
  brief: Brief,
  key: string,
  country: string,
  confirmed: Lead[],
  seen: Set<string>,
  websites: string[],
  atlasNames: string[] = []
): Promise<Lead[]> {
  const names = [...new Set([...confirmed.map((lead) => lead.name), ...atlasNames])]
  const query = dumpSimilarQuery(names, country, brief)
  const jobId = await startAgentRun(key, query, websites, {
    effort: "medium",
    systemPrompt: dumpSimilarSystemPrompt(),
    schema: SIMILAR_SCHEMA,
  })
  const deadline = Date.now() + 4 * 60 * 1000
  let companies: { name: string; website: string; country: string; why: string; role: string }[] = []
  while (Date.now() < deadline) {
    const polled = await pollAgentRun(key, jobId)
    if (polled.status === "completed") {
      companies = polled.companies
      break
    }
    if (polled.status === "failed" || polled.status === "cancelled") break
    await new Promise((resolve) => setTimeout(resolve, 4000))
  }
  if (companies.length === 0) {
    const fallback = await namedSearch(key, query).catch(() => [] as ExaWebHit[])
    companies = fallback.map((hit) => ({
      name: hit.title,
      website: hit.url,
      country,
      why: hit.text,
      role: "importer",
    }))
  }
  const extra: Lead[] = []
  for (const company of companies) {
    if (!similarHitAllowed(company.name, names)) continue
    const hit = { title: company.name, url: company.website, text: company.why }
    const lead = leadFromHit(
      company.name,
      country,
      hit,
      "similar",
      `Exa sugeriu um importador similar a ${names.slice(0, 2).join(", ")}. Firecrawl confirma a página. O dump não confirma compra.`,
      company.role || "importer"
    )
    if (!lead) continue
    if (websites.some((site) => sameSite(site, lead.url))) continue
    if (seen.has(lead.domain)) continue
    seen.add(lead.domain)
    extra.push(lead)
    if (extra.length >= MAX_SIMILAR_PER_COUNTRY) break
  }
  return extra
}

async function atlasForDump(filings: TradeFiling[], brief: Brief): Promise<AtlasLookup> {
  try {
    const token = await ensureAtlasToken()
    if (!token) return enrichDumpWithAtlas(filings, brief, { connected: false })
    const client = await createAtlasClient(token)
    return await enrichDumpWithAtlas(filings, brief, { client, connected: true })
  } catch (error) {
    const fallback = emptyAtlasLookup(
      error instanceof Error
        ? `Company Atlas falhou: ${error.message}. Dump + API segue com Exa e Firecrawl.`
        : "Company Atlas falhou. Dump + API segue com Exa e Firecrawl."
    )
    return enrichDumpWithAtlas(filings, brief, { connected: false }).then((lookup) => ({
      ...lookup,
      note: fallback.note,
    }))
  }
}

export async function searchDumpFlow(
  brief: Brief,
  key: string,
  filings: TradeFiling[],
  also?: Brief
): Promise<{
  leads: Lead[]
  rejected: RejectedSeed[]
  confirmed: number
  similar: number
  candidates: number
  atlasNote: string
  atlasCredits: number
}> {
  const candidates = candidatesForBrief(filings, brief)
  const websites = [brief.website, also?.website].filter((site): site is string => Boolean(site))
  const seen = new Set<string>()
  const leads: Lead[] = []
  const rejected: RejectedSeed[] = []
  const atlas = await atlasForDump(candidates, brief)

  for (const filing of candidates) {
    const atlasMatch = atlas.matches.get(atlasLookupKey(filing.importer, filing.country))
    try {
      const result = await confirmOne(filing, brief, key, seen, websites)
      if (result.lead) {
        applyAtlasToLead(result.lead, atlas)
        seen.add(result.lead.domain)
        leads.push(result.lead)
      } else if (result.rejected) {
        rejected.push({
          ...result.rejected,
          reason: atlasRejectedReason(atlasMatch, result.rejected.reason),
        })
      }
    } catch (error) {
      rejected.push({
        importer: filing.importer,
        country: filing.country,
        reason: atlasRejectedReason(
          atlasMatch,
          error instanceof Error ? error.message : "Exa falhou nesta confirmação."
        ),
      })
    }
  }

  const confirmed = [...leads]
  const byCountry = new Map<string, Lead[]>()
  for (const lead of confirmed) {
    const country = lead.market || lead.country
    const list = byCountry.get(country) ?? []
    list.push(lead)
    byCountry.set(country, list)
  }
  for (const [country, group] of byCountry) {
    try {
      const extra = await similarInCountry(
        brief,
        key,
        country,
        group,
        seen,
        websites,
        extraAtlasNames(atlas, country)
      )
      leads.push(...extra)
    } catch {
      // Similar search is extra. Confirmed dump names still go through Firecrawl.
    }
  }

  for (const lead of leads) {
    applyFilingToLead(lead, filings, brief)
    applyAtlasToLead(lead, atlas)
  }

  return {
    leads,
    rejected,
    confirmed: confirmed.length,
    similar: leads.length - confirmed.length,
    candidates: candidates.length,
    atlasNote: atlas.note,
    atlasCredits: atlas.creditsUsed,
  }
}

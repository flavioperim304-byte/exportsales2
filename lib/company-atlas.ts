import { classifyPartner, isGlobalBrandImporter, isLogisticsName, namesAlign } from "./trade-records"
import type { AtlasMatch, AtlasPartner, Brief, Lead, TradeFiling, TradePartner } from "./types"

export const ATLAS_MCP_URL = "https://thecompanyatlas.com/mcp"
export const ATLAS_MONTHLY_CREDITS = 50
export const ATLAS_RUN_BUDGET = 12
export const ATLAS_MAX_COUNTRIES = 4
export const ATLAS_MAX_PARTNERS = 4
export const ATLAS_DEFAULT_HS = "3305"
export const ATLAS_YEARS = [2023, 2024, 2025] as const

export const ATLAS_TOOLS = {
  rank: "Trade_company_trade_volume_by_year",
  search: "Trade_search_trades",
  mix: "Trade_hs_code_breakdown",
  countries: "Trade_year_country_breakdown",
  partners: "Trade_partner_breakdown",
  companySearch: "Company_search",
} as const

export type AtlasMarket = {
  country: string
  iso: string
  years: string
  limited: boolean
}

/** Live free-plan table on thecompanyatlas.com/mcp/pricing. Every market is included. */
export const ATLAS_MARKETS: AtlasMarket[] = [
  { country: "Indonesia", iso: "ID", years: "2018–2026", limited: false },
  { country: "India", iso: "IN", years: "2012–2026", limited: false },
  { country: "Vietnam", iso: "VN", years: "2019–2026", limited: false },
  { country: "Argentina", iso: "AR", years: "2019–2026", limited: false },
  { country: "Tanzania", iso: "TZ", years: "2024–2026", limited: false },
  { country: "Kazakhstan", iso: "KZ", years: "2024–2026", limited: false },
  { country: "Colombia", iso: "CO", years: "2024–2026", limited: false },
  { country: "Ukraine", iso: "UA", years: "2020–2026", limited: false },
  { country: "Peru", iso: "PE", years: "2019–2026", limited: false },
  { country: "Russia", iso: "RU", years: "2013–2025", limited: false },
  { country: "Costa Rica", iso: "CR", years: "2024–2026", limited: false },
  { country: "Chile", iso: "CL", years: "2019–2026", limited: false },
  { country: "Bangladesh", iso: "BD", years: "2019–2026", limited: false },
  { country: "Uzbekistan", iso: "UZ", years: "2024–2026", limited: false },
  { country: "Pakistan", iso: "PK", years: "2019–2026", limited: false },
  { country: "Philippines", iso: "PH", years: "2019–2026", limited: false },
  { country: "Cote d'Ivoire", iso: "CI", years: "2024–2026", limited: false },
  { country: "Paraguay", iso: "PY", years: "2024–2026", limited: false },
  { country: "Nigeria", iso: "NG", years: "2019–2025", limited: false },
  { country: "Ecuador", iso: "EC", years: "2024–2026", limited: true },
  { country: "Uganda", iso: "UG", years: "2019–2026", limited: true },
  { country: "Kenya", iso: "KE", years: "2024–2026", limited: true },
  { country: "Ethiopia", iso: "ET", years: "2024–2026", limited: true },
  { country: "Uruguay", iso: "UY", years: "2024–2026", limited: true },
  { country: "Sri Lanka", iso: "LK", years: "2024–2026", limited: true },
  { country: "Panama", iso: "PA", years: "2024–2026", limited: true },
  { country: "South Sudan", iso: "SS", years: "2024–2026", limited: true },
  { country: "Cameroon", iso: "CM", years: "2024–2026", limited: true },
  { country: "Nicaragua", iso: "NI", years: "2024–2026", limited: true },
  { country: "Ghana", iso: "GH", years: "2024–2026", limited: true },
  { country: "Namibia", iso: "NA", years: "2024–2026", limited: true },
  { country: "Venezuela", iso: "VE", years: "2024", limited: true },
  { country: "Malawi", iso: "MW", years: "2024–2026", limited: true },
  { country: "Botswana", iso: "BW", years: "2024–2026", limited: true },
  { country: "Sao Tome", iso: "ST", years: "2024–2026", limited: true },
  { country: "Rwanda", iso: "RW", years: "2024–2026", limited: true },
]

export type AtlasToolClient = {
  call(name: string, args: Record<string, unknown>): Promise<unknown>
}

export type AtlasRankedCompany = {
  companyId: string
  name: string
  lineCount: number
  years: number[]
}

export type AtlasShipment = {
  buyer: string
  buyerId: string
  seller: string
  sellerId: string
  hs: string
  description: string
  date: string
  value?: number
  currency: string
}

export type AtlasPlan = {
  ranks: { country: string; iso: string; limited: boolean; hs: string }[]
  partnerSlots: number
  budget: number
  hs: string
}

export type AtlasLookup = {
  matches: Map<string, AtlasMatch>
  extraNames: Map<string, string[]>
  creditsUsed: number
  note: string
}

export type AtlasCoverage = {
  connected: boolean
  monthlyCredits: number
  overlapping: { country: string; iso: string; years: string; limited: boolean; candidates: number }[]
  outside: { country: string; candidates: number }[]
  note: string
}

function foldPlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/ivory coast/g, "cote divoire")
    .replace(/sao tome and principe|sao tome/g, "sao tome")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function atlasMarketFor(country: string): AtlasMarket | undefined {
  const place = foldPlace(country)
  if (!place) return undefined
  const exact = ATLAS_MARKETS.find((market) => foldPlace(market.country) === place)
  if (exact) return exact
  return ATLAS_MARKETS.find((market) => {
    const name = foldPlace(market.country)
    if (name.length < 4) return false
    return place.includes(name) && place !== name
  })
}

export function atlasHsPrefix(brief?: Pick<Brief, "hsCode">): string {
  const digits = (brief?.hsCode ?? "").replace(/\D/g, "")
  if (!digits) return ATLAS_DEFAULT_HS
  return digits.slice(0, Math.max(4, Math.min(6, digits.length)))
}

export function atlasLookupKey(importer: string, country: string): string {
  return `${importer.trim().toLowerCase()}|${country.trim().toLowerCase()}`
}

export function atlasCoverage(
  countries: { country: string; candidates: number }[],
  connected = false
): AtlasCoverage {
  const overlapping: AtlasCoverage["overlapping"] = []
  const outside: AtlasCoverage["outside"] = []
  for (const row of countries) {
    if (row.candidates <= 0) continue
    const market = atlasMarketFor(row.country)
    if (market) {
      overlapping.push({
        country: row.country,
        iso: market.iso,
        years: market.years,
        limited: market.limited,
        candidates: row.candidates,
      })
    } else {
      outside.push({ country: row.country, candidates: row.candidates })
    }
  }
  overlapping.sort((left, right) => right.candidates - left.candidates)
  outside.sort((left, right) => right.candidates - left.candidates)
  const limited = overlapping.filter((row) => row.limited).length
  const note = overlapping.length
    ? `Company Atlas cobre ${overlapping.length} país${overlapping.length === 1 ? "" : "es"} deste dump (${overlapping.map((row) => row.country).join(", ")}).${limited ? ` ${limited} com cobertura limitada.` : ""} Fora do Atlas: ${outside.length ? outside.map((row) => row.country).join(", ") : "nenhum dos candidatos"}. 50 créditos/mês, 1 por chamada. Linha Atlas confirma declaração HS, não compra Kanechom/LQ.`
    : `Nenhum candidato deste dump está nos 36 mercados da Company Atlas. Dump + API continua com Exa e Firecrawl.`
  return {
    connected,
    monthlyCredits: ATLAS_MONTHLY_CREDITS,
    overlapping,
    outside,
    note,
  }
}

export function planAtlasLookups(
  filings: TradeFiling[],
  brief: Brief,
  budget = ATLAS_RUN_BUDGET
): AtlasPlan {
  const hs = atlasHsPrefix(brief)
  const counts = new Map<string, { market: AtlasMarket; count: number }>()
  for (const row of filings) {
    const market = atlasMarketFor(row.country)
    if (!market) continue
    const current = counts.get(market.iso)
    if (current) current.count += 1
    else counts.set(market.iso, { market, count: 1 })
  }
  const ranked = [...counts.values()].sort((left, right) => right.count - left.count)
  const picked = ranked.slice(0, ATLAS_MAX_COUNTRIES)
  const ranks = picked.map((row) => ({
    country: row.market.country,
    iso: row.market.iso,
    limited: row.market.limited,
    hs,
  }))
  const leftover = Math.max(0, budget - ranks.length)
  return {
    ranks,
    partnerSlots: Math.min(ATLAS_MAX_PARTNERS, leftover),
    budget,
    hs,
  }
}

function blockedAtlasName(name: string): boolean {
  return isLogisticsName(name) || isGlobalBrandImporter(name)
}

export function matchAtlasName(importer: string, companies: AtlasRankedCompany[]): AtlasRankedCompany | undefined {
  if (blockedAtlasName(importer)) return undefined
  return companies.find((row) => namesAlign(importer, row.name) && !blockedAtlasName(row.name))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return ""
}

function readNumber(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/,/g, ""))
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

export function unwrapAtlasPayload(result: unknown): unknown {
  const root = asRecord(result)
  if (!root) return result
  const content = root.content
  if (Array.isArray(content)) {
    for (const part of content) {
      const row = asRecord(part)
      if (!row) continue
      const text = readString(row, "text")
      if (!text) continue
      try {
        return JSON.parse(text) as unknown
      } catch {
        return text
      }
    }
  }
  if ("result" in root) return unwrapAtlasPayload(root.result)
  return result
}

function collectRows(payload: unknown): Record<string, unknown>[] {
  const unwrapped = unwrapAtlasPayload(payload)
  if (Array.isArray(unwrapped)) {
    return unwrapped.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row))
  }
  const root = asRecord(unwrapped)
  if (!root) return []
  for (const key of ["companies", "rows", "results", "items", "data", "shipments", "trades"]) {
    const value = root[key]
    if (Array.isArray(value)) {
      return value.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row))
    }
  }
  return [root]
}

function yearsFrom(row: Record<string, unknown>): number[] {
  const direct = row.years
  if (Array.isArray(direct)) {
    return direct
      .map((item) => {
        if (typeof item === "number") return item
        if (typeof item === "string") return Number(item)
        const nested = asRecord(item)
        return nested ? readNumber(nested, "year") : 0
      })
      .filter((year) => year >= 2012)
  }
  if (direct && typeof direct === "object") {
    return Object.keys(direct)
      .map((key) => Number(key))
      .filter((year) => year >= 2012)
  }
  const year = readNumber(row, "year")
  return year >= 2012 ? [year] : []
}

export function parseAtlasRank(payload: unknown): AtlasRankedCompany[] {
  const seen = new Set<string>()
  const companies: AtlasRankedCompany[] = []
  for (const row of collectRows(payload)) {
    const name = readString(row, "name", "company_name", "companyName", "buyer", "seller")
    if (!name || blockedAtlasName(name)) continue
    const companyId = readString(row, "company_id", "companyId", "id", "buyer_id", "seller_id")
    const key = `${companyId}|${name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    companies.push({
      companyId,
      name,
      lineCount: readNumber(row, "line_count", "lineCount", "lines", "count", "total_lines", "shipments"),
      years: yearsFrom(row),
    })
  }
  return companies
}

export function parseAtlasShipments(payload: unknown): AtlasShipment[] {
  return collectRows(payload).map((row) => ({
    buyer: readString(row, "buyer", "buyer_name", "consignee"),
    buyerId: readString(row, "buyer_id", "buyerId"),
    seller: readString(row, "seller", "seller_name", "shipper"),
    sellerId: readString(row, "seller_id", "sellerId"),
    hs: readString(row, "hs_code", "hs", "hsCode"),
    description: readString(row, "goods_description", "description", "product"),
    date: readString(row, "date", "declaration_date", "declarationDate"),
    value: readNumber(row, "value", "declared_value") || undefined,
    currency: readString(row, "currency", "invoice_currency"),
  }))
}

export function parseAtlasPartners(payload: unknown): AtlasPartner[] {
  const unwrapped = unwrapAtlasPayload(payload)
  const root = asRecord(unwrapped) ?? {}
  const groups: { rows: unknown; direction: AtlasPartner["direction"] }[] = [
    { rows: root.suppliers ?? root.sellers ?? root.imports, direction: "supplier" },
    { rows: root.customers ?? root.buyers ?? root.exports, direction: "customer" },
  ]
  if (!groups.some((group) => Array.isArray(group.rows))) {
    groups.push({ rows: collectRows(unwrapped), direction: "supplier" })
  }
  const partners: AtlasPartner[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    if (!Array.isArray(group.rows)) continue
    for (const item of group.rows) {
      const row = asRecord(item)
      if (!row) continue
      const name = readString(row, "name", "company_name", "companyName", "partner")
      if (!name) continue
      const key = `${group.direction}|${name.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      partners.push({
        name,
        companyId: readString(row, "company_id", "companyId", "id") || undefined,
        direction: group.direction,
        value: readNumber(row, "value", "total_value") || undefined,
      })
    }
  }
  return partners
}

function rankArgs(iso: string, hs: string): Record<string, unknown> {
  return {
    hs_code: hs,
    direction: "import",
    line_type: 2,
    buyer_country: iso,
    years: [...ATLAS_YEARS],
  }
}

function searchArgs(iso: string, hs: string, buyer?: string): Record<string, unknown> {
  return {
    hs_code: hs,
    line_type: 2,
    buyer_country: iso,
    buyer: buyer || undefined,
    date_from: `${ATLAS_YEARS[0]}-01-01`,
    date_to: `${ATLAS_YEARS[ATLAS_YEARS.length - 1]}-12-31`,
  }
}

function hitFromCompany(company: AtlasRankedCompany, hs: string, limited: boolean): AtlasMatch {
  return {
    status: "hit",
    companyId: company.companyId || undefined,
    companyName: company.name,
    hs,
    lineCount: company.lineCount || undefined,
    years: company.years,
    partners: [],
    limited,
    note: company.companyId
      ? `Company Atlas achou declaração HS ${hs} para ${company.name}. Continua indicação — não confirma compra Kanechom/LQ.`
      : `Company Atlas achou o nome em declaração HS ${hs}, sem id de registro (matching 2026 incompleto). Continua indicação.`,
  }
}

function shipmentsToCompanies(rows: AtlasShipment[]): AtlasRankedCompany[] {
  const map = new Map<string, AtlasRankedCompany>()
  for (const row of rows) {
    const name = row.buyer
    if (!name) continue
    const key = `${row.buyerId}|${name.toLowerCase()}`
    const current = map.get(key)
    if (current) {
      current.lineCount += 1
      continue
    }
    const year = Number((row.date || "").slice(0, 4))
    map.set(key, {
      companyId: row.buyerId,
      name,
      lineCount: 1,
      years: year >= 2012 ? [year] : [],
    })
  }
  return [...map.values()]
}

export function emptyAtlasLookup(note: string): AtlasLookup {
  return { matches: new Map(), extraNames: new Map(), creditsUsed: 0, note }
}

export async function enrichDumpWithAtlas(
  filings: TradeFiling[],
  brief: Brief,
  options: { client?: AtlasToolClient; connected?: boolean; budget?: number } = {}
): Promise<AtlasLookup> {
  const plan = planAtlasLookups(filings, brief, options.budget)
  const matches = new Map<string, AtlasMatch>()
  const extraNames = new Map<string, string[]>()
  const skippedNote =
    "Company Atlas não conectado. No Cursor: MCP remoto https://thecompanyatlas.com/mcp (Google). No desk: Fontes → Connect. 50 créditos/mês."

  for (const filing of filings) {
    const market = atlasMarketFor(filing.country)
    matches.set(
      atlasLookupKey(filing.importer, filing.country),
      market
        ? {
            status: options.client ? "miss" : "skipped",
            partners: [],
            limited: market.limited,
            note: options.client
              ? `Company Atlas não achou HS ${plan.hs} para este nome em ${market.country}. Ausência não prova que o dump é falso.`
              : skippedNote,
          }
        : {
            status: "no_market",
            partners: [],
            note: `${filing.country} não está nos 36 mercados da Company Atlas. Dump + API segue com Exa e Firecrawl.`,
          }
    )
  }

  if (!options.client) {
    return {
      matches,
      extraNames,
      creditsUsed: 0,
      note: plan.ranks.length
        ? `${skippedNote} ${plan.ranks.length} país(es) no overlap: ${plan.ranks.map((row) => row.country).join(", ")}.`
        : "Nenhum candidato deste dump está nos 36 mercados da Company Atlas.",
    }
  }

  let creditsUsed = 0

  for (const rank of plan.ranks) {
    if (creditsUsed >= plan.budget) break
    try {
      const payload = await options.client.call(ATLAS_TOOLS.rank, rankArgs(rank.iso, rank.hs))
      creditsUsed += 1
      let companies = parseAtlasRank(payload)
      const countryFilings = filings.filter((row) => atlasMarketFor(row.country)?.iso === rank.iso)
      let unmatched = countryFilings.filter((row) => !matchAtlasName(row.importer, companies))
      if (unmatched.length && creditsUsed < plan.budget) {
        const search = await options.client.call(ATLAS_TOOLS.search, searchArgs(rank.iso, rank.hs))
        creditsUsed += 1
        const fromLines = shipmentsToCompanies(parseAtlasShipments(search))
        const seen = new Set(companies.map((row) => row.name.toLowerCase()))
        for (const row of fromLines) {
          if (!seen.has(row.name.toLowerCase())) companies.push(row)
        }
      }
      for (const filing of countryFilings) {
        const hit = matchAtlasName(filing.importer, companies)
        if (!hit) continue
        matches.set(atlasLookupKey(filing.importer, filing.country), hitFromCompany(hit, rank.hs, rank.limited))
      }
      extraNames.set(
        rank.country,
        companies
          .filter((row) => !blockedAtlasName(row.name))
          .filter((row) => !countryFilings.some((filing) => namesAlign(filing.importer, row.name)))
          .slice(0, 6)
          .map((row) => row.name)
      )
    } catch (error) {
      creditsUsed += 1
      for (const filing of filings.filter((row) => atlasMarketFor(row.country)?.iso === rank.iso)) {
        matches.set(atlasLookupKey(filing.importer, filing.country), {
          status: "error",
          partners: [],
          limited: rank.limited,
          note: error instanceof Error ? error.message : "Company Atlas falhou nesta chamada.",
        })
      }
    }
  }

  const hits = [...matches.values()].filter((row) => row.status === "hit" && row.companyId)
  let partnersUsed = 0
  for (const hit of hits) {
    if (partnersUsed >= plan.partnerSlots || creditsUsed >= plan.budget) break
    if (!hit.companyId) continue
    try {
      const payload = await options.client.call(ATLAS_TOOLS.partners, { company_id: hit.companyId })
      creditsUsed += 1
      partnersUsed += 1
      hit.partners = parseAtlasPartners(payload)
      if (hit.partners.length) {
        hit.note = `${hit.note} Livro de parceiros veio do Atlas (${hit.partners.length} nomes). Ainda não é compra da sua marca.`
      }
    } catch {
      creditsUsed += 1
      partnersUsed += 1
    }
  }

  const hitCount = [...matches.values()].filter((row) => row.status === "hit").length
  return {
    matches,
    extraNames,
    creditsUsed,
    note: `Company Atlas usou ${creditsUsed} crédito${creditsUsed === 1 ? "" : "s"} (teto ${plan.budget}/mês ${ATLAS_MONTHLY_CREDITS}). ${hitCount} nome${hitCount === 1 ? "" : "s"} com declaração HS ${plan.hs}. Não confirma compra.`,
  }
}

export function atlasPartnersToTrade(partners: AtlasPartner[]): TradePartner[] {
  return partners
    .filter((row) => row.direction === "supplier")
    .slice(0, 8)
    .map((row) => {
      const classified = classifyPartner(row.name)
      return {
        name: row.name,
        kind: classified.kind,
        canonical: classified.canonical,
      }
    })
}

export function applyAtlasToLead(lead: Lead, lookup: AtlasLookup): Lead {
  const match =
    lookup.matches.get(atlasLookupKey(lead.name, lead.country)) ||
    lookup.matches.get(atlasLookupKey(lead.name, lead.market || "")) ||
    [...lookup.matches.entries()].find(([key]) => namesAlign(key.split("|")[0] || "", lead.name))?.[1]
  if (!match) return lead
  lead.atlas = match
  if (match.status === "hit") {
    const existing = lead.commerce ?? { fetchedAt: new Date().toISOString(), signals: [] }
    lead.commerce = {
      ...existing,
      signals: [
        {
          kind: "customs",
          source: "company_atlas",
          title: `Company Atlas HS ${match.hs || ATLAS_DEFAULT_HS}`,
          url: ATLAS_MCP_URL,
          quote: match.note,
        },
        ...existing.signals.filter((item) => item.source !== "company_atlas"),
      ],
    }
  }
  if (match.status === "hit" && match.partners.length && lead.filing?.partnersRedacted) {
    lead.filing = {
      ...lead.filing,
      partners: atlasPartnersToTrade(match.partners),
      partnersRedacted: false,
      note: `${lead.filing.note} Company Atlas preencheu parceiros. Continua indicação, não confirma compra.`,
    }
  }
  if (lead.apiConfirm && match.status === "hit") {
    lead.apiConfirm = {
      ...lead.apiConfirm,
      note: `${lead.apiConfirm.note} ${match.note}`.trim(),
    }
  }
  return lead
}

export function atlasRejectedReason(match: AtlasMatch | undefined, reason: string): string {
  if (!match) return reason
  if (match.status === "hit") {
    return `${reason} Atlas tem declaração HS — o nome provavelmente existe; o site é que não confirmou.`
  }
  if (match.status === "miss") {
    return `${reason} Atlas também não achou HS ${ATLAS_DEFAULT_HS} neste mercado.`
  }
  return reason
}

export function extraAtlasNames(lookup: AtlasLookup, country: string): string[] {
  const market = atlasMarketFor(country)
  if (!market) return []
  return lookup.extraNames.get(market.country) ?? lookup.extraNames.get(country) ?? []
}

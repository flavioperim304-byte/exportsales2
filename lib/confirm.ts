import {
  isGlobalBrandImporter,
  isLogisticsName,
  isSearchCandidate,
  namesAlign,
} from "./trade-records"
import { evidenceRule } from "./prompts"
import type { ApiConfirm, Brief, Extraction, Lead, RejectedSeed, TradeFiling } from "./types"
import { clip, splitList } from "./text"

export type { RejectedSeed }

const SOCIAL = /linkedin\.com|facebook\.com|instagram\.com|wikipedia\.org|youtube\.com|tiktok\.com/i

const HAIR =
  /shampoo|hair\s*care|capilar|cosmetics?|cosmet|condicionador|keratin|queratin|beauty\s*care|cuidado\s+capilar|personal\s+care|higiene\s+pessoal|salon\s+brand|profissional\s+capilar/i

const IMPORT_ROLE =
  /import|distrib|wholesale|atacad|mayorista|trading\s+compan|importador|distribuidor/i

export const MAX_CANDIDATES_PER_COUNTRY = 8
export const MAX_CANDIDATES = 24
export const MAX_SIMILAR_PER_COUNTRY = 6

export type ExaWebHit = {
  title: string
  url: string
  text: string
}

export function blockedImporterName(name: string): boolean {
  return isLogisticsName(name) || isGlobalBrandImporter(name)
}

export function hairCareSignal(text: string): boolean {
  return HAIR.test(text)
}

export function importRoleSignal(text: string): boolean {
  return IMPORT_ROLE.test(text)
}

export function countryInMarkets(country: string, markets: string[]): boolean {
  if (markets.length === 0) return true
  const place = country.trim().toLowerCase()
  if (!place) return false
  return markets.some((market) => {
    const token = market.trim().toLowerCase()
    if (!token) return false
    return place === token || place.includes(token) || token.includes(place)
  })
}

function hsMatchesBrief(hs: string, brief: Brief): boolean {
  const wanted = (brief.hsCode ?? "").replace(/\D/g, "")
  if (!wanted) return true
  return hs.startsWith(wanted) || wanted.startsWith(hs.slice(0, Math.min(4, wanted.length)))
}

export function candidatesForBrief(filings: TradeFiling[], brief: Brief): TradeFiling[] {
  const markets = splitList(brief.markets)
  const pool = filings.filter(
    (row) =>
      isSearchCandidate(row) && countryInMarkets(row.country, markets) && hsMatchesBrief(row.hs, brief)
  )
  const ranked = [...pool].sort((left, right) => right.hsShipments - left.hsShipments)
  const byCountry = new Map<string, number>()
  const picked: TradeFiling[] = []
  for (const row of ranked) {
    const used = byCountry.get(row.country) ?? 0
    if (used >= MAX_CANDIDATES_PER_COUNTRY) continue
    byCountry.set(row.country, used + 1)
    picked.push(row)
    if (picked.length >= MAX_CANDIDATES) break
  }
  return picked
}

export function dumpCountries(filings: TradeFiling[]): string[] {
  return [...new Set(filings.filter(isSearchCandidate).map((row) => row.country).filter(Boolean))].sort()
}

function officialSite(url: string): boolean {
  if (!url) return false
  if (SOCIAL.test(url)) return false
  return /^https?:\/\//i.test(url) || /^[\w.-]+\.[a-z]{2,}/i.test(url)
}

function namesHit(filing: TradeFiling, hit: ExaWebHit): boolean {
  return namesAlign(hit.title, filing.importer) || namesAlign(hit.text.slice(0, 240), filing.importer)
}

export function pickExaConfirmation(
  filing: TradeFiling,
  hits: ExaWebHit[]
): { hit?: ExaWebHit; status: "confirmed" | "rejected"; reason: string } {
  if (hits.length === 0) {
    return { status: "rejected", reason: "Exa não achou a empresa. Dump pode ser falso." }
  }
  const ranked = hits.filter((hit) => officialSite(hit.url))
  if (ranked.length === 0) {
    return { status: "rejected", reason: "Exa não devolveu um site da empresa." }
  }
  const named = ranked.filter((hit) => namesHit(filing, hit))
  if (named.length === 0) {
    return { status: "rejected", reason: "Exa não confirmou este nome na web. Dump pode ser falso." }
  }
  const allowed = named.filter((hit) => !blockedImporterName(hit.title))
  if (allowed.length === 0) {
    return { status: "rejected", reason: "Exa devolveu logística ou marca global." }
  }
  const confirmed = allowed.find((hit) => {
    const blob = `${hit.title} ${hit.text}`
    return hairCareSignal(blob) && importRoleSignal(blob)
  })
  if (!confirmed) {
    const hairOnly = allowed.find((hit) => hairCareSignal(`${hit.title} ${hit.text}`))
    if (!hairOnly) {
      return {
        status: "rejected",
        reason: "Exa achou o nome, mas não como importador de hair care.",
      }
    }
    return {
      hit: hairOnly,
      status: "confirmed",
      reason: "Exa confirmou a empresa de hair care na web. O dump continua só indicação.",
    }
  }
  return {
    hit: confirmed,
    status: "confirmed",
    reason: "Exa confirmou o importador de hair care na web. O dump continua só indicação.",
  }
}

export function firecrawlConfirms(extraction: Extraction | undefined): {
  status: ApiConfirm["firecrawl"]
  reason: string
} {
  if (!extraction) return { status: "pending", reason: "Firecrawl ainda não leu a página." }
  if (!extraction.ok) {
    return { status: "skipped", reason: "Firecrawl não leu a página. Sem confirmação da API." }
  }
  const name = extraction.companyName || ""
  if (blockedImporterName(name) || blockedImporterName(extraction.role)) {
    return { status: "rejected", reason: "A página é logística ou marca global. APIs descartaram." }
  }
  const blob = [
    extraction.role,
    extraction.summary,
    extraction.buys.join(" "),
    extraction.sells.join(" "),
    extraction.buyerSignals.join(" "),
  ].join(" ")
  const hair = hairCareSignal(blob)
  const role = importRoleSignal(extraction.role) || importRoleSignal(blob)
  if (hair && role) {
    return {
      status: "confirmed",
      reason: "Firecrawl confirmou importador/distribuidor de hair care na página.",
    }
  }
  if (!hair) {
    return { status: "rejected", reason: "A página não mostra hair care. APIs não confirmaram." }
  }
  return {
    status: "rejected",
    reason: "A página mostra hair care, mas não importação/distribuição. APIs não confirmaram.",
  }
}

export function blankApiConfirm(seed: Lead["seed"] = "dump"): ApiConfirm {
  return {
    exa: seed === "dump" ? "pending" : "confirmed",
    firecrawl: "pending",
    note:
      seed === "dump"
        ? "Dump é só semente. Exa e Firecrawl ainda vão confirmar ou descartar."
        : "Exa sugeriu um concorrente similar. Firecrawl confirma a página.",
  }
}

export function apiConfirmNote(confirm: ApiConfirm): string {
  const bits = [confirm.note]
  if (confirm.exa === "confirmed" && confirm.firecrawl === "confirmed") {
    bits.unshift("Exa e Firecrawl confirmaram a empresa.")
  } else if (confirm.exa === "confirmed" && confirm.firecrawl === "rejected") {
    bits.unshift("Exa achou a empresa; Firecrawl não confirmou importador de hair care.")
  } else if (confirm.exa === "rejected") {
    bits.unshift("Exa não confirmou. Dump não basta.")
  }
  return clip([...new Set(bits)].join(" "), 280)
}

export { dumpApisConfirmed as apisConfirmed, shouldClassifyLead } from "./dump-signal"

export function dumpConfirmQuery(name: string, country: string, products: string): string {
  const category = products.trim() || "hair care, shampoo, cosmetics"
  return [
    `"${name}" ${country} ${category} importer OR distributor OR importador OR distribuidor`,
    "Official company website only. Do not invent a company, a website, or a purchase.",
    "Skip logistics, freight forwarders, Amazon, and global brand subsidiaries (Unilever, P&G, L'Oréal, Avon, Genomma, PriceSmart, Alfaparf, Belcorp, Mesoestetic, Arabela, Feduro, Henkel).",
  ].join(" ")
}

export function dumpSimilarQuery(names: string[], country: string, brief: Brief): string {
  const listed = names.slice(0, 6).join("; ")
  const products = brief.products.trim() || "hair care, shampoo, cosmetics"
  return [
    `Find importers and distributors in ${country} similar to: ${listed}.`,
    `They should buy or import ${products}.`,
    "Similar means a diversified hair or beauty brand book and a large salon or retail client base, in the range of Nazih Trading (nazih.com, Dubai), Gem Import & Export (gemegypt.com), and SSIZ (ssiz.in).",
    "Return official company websites of local importers or distributors.",
    "Do not invent a company that is not on the public web.",
    "Do not return logistics companies, freight forwarders, couriers, Amazon, or global-brand subsidiaries: Unilever, P&G, L'Oréal, Avon, Genomma, PriceSmart, Alfaparf, Belcorp, Mesoestetic, Arabela, Feduro, Henkel.",
    `These are buyers for ${brief.supplierName}, from ${brief.originCountry}. Do not return ${brief.supplierName} itself.`,
    brief.exclusions ? `Do not return: ${brief.exclusions}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

export function dumpSimilarSystemPrompt(): string {
  return [
    evidenceRule(),
    "You are in search mode.",
    "Return real local importers or distributors and their official websites.",
    "They must be similar competitor importers of the named companies, in the same country.",
    "Skip logistics, freight forwarders, Amazon, retailers without wholesale, salons, and global brand subsidiaries.",
    "Do not score the companies and do not invent email addresses or phone numbers.",
  ].join(" ")
}

export function similarHitAllowed(name: string, known: string[]): boolean {
  if (blockedImporterName(name)) return false
  return !known.some((item) => namesAlign(name, item))
}

import { mentionsCompany } from "./activity"
import type { Brief, CommerceKind, CommerceSignal, CommerceSnapshot, Lead } from "./types"
import { ApiError, requestJson } from "./http"
import { asString, clip, sameSite } from "./text"

export const COMMERCE_MONTHS = 24

export type { CommerceKind, CommerceSignal, CommerceSnapshot }

const KIND_LABEL: Record<CommerceKind, string> = {
  customs: "aduana / embarque",
  restock: "reposição",
  trade_fair: "feira",
  open_book: "livro aberto",
  hiring_buy: "vaga de compras",
}

const KIND_RANK: Record<CommerceKind, number> = {
  customs: 0,
  restock: 1,
  trade_fair: 2,
  open_book: 3,
  hiring_buy: 4,
}

/** Third-party or specific cargo language — not the word “importer” on a brochure. */
const CUSTOMS_DOC =
  /\b(bill of lading|bl\/awb|aduana|aduaner[oa]s?|manifiesto(?: de carga)?|manifesto de carga|despacho aduanero|customs (?:record|declaration|clearance|filing)|siga|sice|hs[- ]?code|ncm)\b/i
const CARGO = /\b(contenedor(?:es)?|containers?|embarque|shipment|lote|carga)\b/i
const IMPORT_VERB =
  /(?:^|[^a-záéíóúñ])(?:importó|importo|importamos|imported|recibimos|recebemos|chegou|arrived|despach(?:o|ó|amos)|cleared)(?:[^a-záéíóúñ]|$)/i
const RESTOCK =
  /\b(restock(?:ed|ing)?|reposi[cç][aã]o|reposici[oó]n|nuevo inventario|acaba de (?:llegar|chegar)|just (?:arrived|restocked)|ya (?:tenemos|hay) stock|back in stock|chegou (?:estoque|stock)|replenish(?:ed|ing)?)\b/i
const FAIR =
  /\b(cosmoprof|beautyworld|in-cosmetics|expocosmetica|feira|feria (?:de|internacional|beauty)|trade fair|exhibitor|stand (?:n[úu]mero|no\.?))\b/i
const OPEN_BOOK =
  /\b(seeking (?:suppliers|brands|new lines)|adding (?:brands|origins|lines)|open to (?:new )?(?:brands|suppliers)|looking for (?:suppliers|new brands)|livro aberto|non-exclusive|no exclusive|buscamos (?:marcas|proveedores)|nuevas marcas)\b/i
const HIRING_BUY =
  /\b(import manager|purchasing manager|gerente de compras|comprador internacional|international buyer|import buyer|procurement manager|vacante de compras|buyer of record)\b/i

export function commerceKindLabel(kind: CommerceKind): string {
  return KIND_LABEL[kind]
}

export function commerceWindowStart(now = new Date()): string {
  const start = new Date(now)
  start.setMonth(start.getMonth() - COMMERCE_MONTHS)
  return start.toISOString()
}

export function commerceBuyQuery(lead: Lead, brief: Brief): string {
  const market = lead.market || lead.country || brief.markets
  return [
    `"${lead.name}"`,
    market,
    '(aduana OR "bill of lading" OR importó OR imported OR contenedor OR embarque OR restock OR reposición OR "in stock" OR "acaba de llegar" OR "última compra" OR customs OR SIGA OR SICE OR shipment)',
  ]
    .filter((part) => part.trim())
    .join(" ")
}

export function commerceIntentQuery(lead: Lead, brief: Brief): string {
  const market = lead.market || lead.country || brief.markets
  return [
    `"${lead.name}"`,
    market,
    '(Cosmoprof OR Beautyworld OR "trade fair" OR feria OR exhibitor OR "seeking suppliers" OR "adding brands" OR "import manager" OR "gerente de compras" OR comprador OR "open to new brands" OR "nuevas marcas")',
  ]
    .filter((part) => part.trim())
    .join(" ")
}

export function isCustomsLanguage(blob: string): boolean {
  if (CUSTOMS_DOC.test(blob)) return true
  return CARGO.test(blob) && IMPORT_VERB.test(blob)
}

export function classifyCommerce(url: string, title: string, text: string): CommerceKind | null {
  const blob = `${title} ${text} ${url}`
  if (isCustomsLanguage(blob)) return "customs"
  if (RESTOCK.test(blob)) return "restock"
  if (HIRING_BUY.test(blob)) return "hiring_buy"
  if (FAIR.test(blob)) return "trade_fair"
  if (OPEN_BOOK.test(blob)) return "open_book"
  return null
}

function isRecent(publishedAt: string | undefined, fetchedAt: string): boolean {
  if (!publishedAt) return true
  const stamp = Date.parse(publishedAt)
  if (Number.isNaN(stamp)) return true
  const fetched = Date.parse(fetchedAt)
  const end = Number.isNaN(fetched) ? Date.now() : fetched
  return end - stamp <= COMMERCE_MONTHS * 30 * 24 * 60 * 60 * 1000
}

export function signalsFromSearch(results: unknown[], lead: Lead): CommerceSignal[] {
  if (!Array.isArray(results)) return []
  const seen = new Set<string>()
  const signals: CommerceSignal[] = []
  for (const item of results) {
    const row = (item ?? {}) as Record<string, unknown>
    const url = asString(row.url)
    const title = asString(row.title)
    const highlights = Array.isArray(row.highlights)
      ? row.highlights.map((part) => asString(part)).filter(Boolean)
      : []
    const text = asString(row.text) || highlights[0] || ""
    if (!url || !title) continue
    if (!mentionsCompany(lead, title, url, text)) continue
    const kind = classifyCommerce(url, title, text)
    if (!kind) continue
    if ((kind === "hiring_buy" || kind === "open_book") && sameSite(url, lead.url)) continue
    const key = `${kind}|${url.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    signals.push({
      kind,
      title,
      url,
      publishedAt: asString(row.publishedDate) || undefined,
      quote: clip(highlights[0] || text || title, 220),
    })
  }
  return signals
    .sort((left, right) => KIND_RANK[left.kind] - KIND_RANK[right.kind])
    .slice(0, 8)
}

export function recentCommerce(lead: Lead): CommerceSignal[] {
  const snapshot = lead.commerce
  if (!snapshot) return []
  return snapshot.signals.filter((signal) => isRecent(signal.publishedAt, snapshot.fetchedAt))
}

export function hasCommerceSignals(lead: Lead): boolean {
  return recentCommerce(lead).length > 0
}

/** Customs filings and restock language fill the purchase/sales gap. A fair or a hiring post does not. */
export function hasCommercialBuyFacts(lead: Lead): boolean {
  return recentCommerce(lead).some((signal) => signal.kind === "customs" || signal.kind === "restock")
}

export function commerceLine(lead: Lead): string {
  if (!lead.commerce) return "Commercial signals have not been searched."
  if (lead.commerce.error && lead.commerce.signals.length === 0) {
    return `Commercial signal search failed. ${lead.commerce.error}`
  }
  const recent = recentCommerce(lead)
  if (recent.length === 0) {
    return `No customs, restock, trade-fair, open-book, or purchasing-hire signal in the last ${COMMERCE_MONTHS} months.`
  }
  const kinds = [...new Set(recent.map((signal) => commerceKindLabel(signal.kind)))].join(", ")
  return `${recent.length} commercial ${recent.length === 1 ? "signal" : "signals"} in the last ${COMMERCE_MONTHS} months: ${kinds}.`
}

export function emptyCommerce(error?: string): CommerceSnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    signals: [],
    error,
  }
}

async function searchOnce(query: string, key: string): Promise<unknown[]> {
  const data = await requestJson("https://api.exa.ai/search", {
    method: "POST",
    timeoutMs: 25000,
    headers: { Authorization: `Bearer ${key}`, "x-api-key": key },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: 8,
      startPublishedDate: commerceWindowStart(),
      contents: {
        text: { maxCharacters: 400 },
        highlights: { maxHighlights: 1, maxCharacters: 180 },
      },
    }),
  })
  const results = (data as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) {
    throw new ApiError("Exa commercial search did not return results.", 502)
  }
  return results
}

export async function searchCommerce(lead: Lead, brief: Brief, key: string): Promise<CommerceSnapshot> {
  const queries = [commerceBuyQuery(lead, brief), commerceIntentQuery(lead, brief)]
  const settled = await Promise.allSettled(queries.map((query) => searchOnce(query, key)))
  const results: unknown[] = []
  const errors: string[] = []
  for (const item of settled) {
    if (item.status === "fulfilled") {
      results.push(...item.value)
    } else {
      const message = item.reason instanceof Error ? item.reason.message : "Exa commercial search failed."
      errors.push(message)
    }
  }
  const signals = signalsFromSearch(results, lead)
  if (signals.length === 0 && errors.length === queries.length) {
    return emptyCommerce(errors[0])
  }
  return {
    fetchedAt: new Date().toISOString(),
    signals,
    error: signals.length === 0 ? errors[0] : undefined,
  }
}

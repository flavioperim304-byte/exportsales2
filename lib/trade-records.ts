import type {
  Brief,
  CommerceSignal,
  CommerceSnapshot,
  Lead,
  TradeCargoKind,
  TradeFiling,
  TradeFilingMatch,
  TradeFilingQuality,
  TradePartner,
  TradePartnerKind,
  TradeSource,
} from "./types"
import { clip } from "./text"

const LEGAL =
  /\b(s\.?a\.?|s\.?a\.?\s*de\s*c\.?v\.?|inc\.?|corp\.?|ltda?\.?|llc|co\.?|company|sas|srl|gmbh|ag)\b/gi

const CHROME =
  /^(port of (?:discharge|loading)|enter port of|trade time|select|weight|kg|-|amount|\$|search method|smart search|strict search|exclude logistics companies|yes|no|sort order|smart order|shipments|recently|search|bulk|download|full access|subscribe to view.*|contatc icon|\d[\d,]* companies in total)$/i

const TAGS = /\b(high-transaction enterprise|leading enterprise|new enterprise)\b/gi

const LOGISTICS =
  /\b(logistic|logistics|freight|forwarder|shipping|courier|starlogic|amcar|o\s*&\s*m\s+logistic|ag logistics|\bag\b|nur logistic)\b/i

const ZONA = /\b(zona libre|colon free|z\.?l\.?s?\.?a)\b/i

const RETAIL_PARCEL = /\bamazon\b/i

const MASS_BRANDS: { re: RegExp; label: string }[] = [
  { re: /\bunilever\b/i, label: "Unilever" },
  { re: /\bprocter\b|\bp&g\b|\bprocter\s*&?\s*gamble\b/i, label: "P&G" },
  { re: /\bavon\b/i, label: "Avon" },
  { re: /\bgenomma|genonna\b/i, label: "Genomma" },
  { re: /\bbelcorp\b|\bbel star\b|\bl\.?\s*bel\b/i, label: "Belcorp" },
  { re: /\bnazca\b/i, label: "Nazca" },
  { re: /\bskala\b/i, label: "Skala" },
  { re: /\bpricesmart\b/i, label: "PriceSmart" },
]

const PRO_BRANDS: { re: RegExp; label: string }[] = [
  { re: /\bl'?oreal\b|\bloreal\b|\bl\.\s*oreal\b/i, label: "L'Oréal" },
  { re: /\bhenkel\b/i, label: "Henkel" },
  { re: /\bnattura\b/i, label: "Nattura" },
  { re: /\balfaparf|alfa parf|beauty\s*&?\s*business\b/i, label: "Alfaparf" },
  { re: /\bmesoestetic\b/i, label: "Mesoestetic" },
]

const PARTNER_CANON: { re: RegExp; name: string }[] = [
  { re: /\bzhejiang\s+qianfei/i, name: "ZHEJIANG QIANFEI" },
  { re: /\bgenom+a\b|\bgenonna\b/i, name: "GENOMMA LAB INTERNACIONAL" },
  { re: /\bunilever\b/i, name: "UNILEVER" },
  { re: /\bprocter/i, name: "PROCTER & GAMBLE" },
  { re: /\bavon\b/i, name: "PRODUCTOS AVON" },
  { re: /\bl'?oreal\b|\bloreal\b|\bl\.\s*oreal\b/i, name: "LOREAL" },
  { re: /\bo\s*&\s*m\s+logistic/i, name: "O&M LOGISTIC" },
  { re: /\bag logistics|\bag$/i, name: "AG LOGISTICS" },
  { re: /\barabela\b/i, name: "ARABELA" },
  { re: /\bpricesmart\b/i, name: "PRICESMART" },
]

export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\by\.\s/g, "y ")
    .replace(/\bcompa ia\b/g, "compania")
    .replace(/\bpaname a\b/g, "panamena")
    .replace(/&/g, " and ")
    .replace(LEGAL, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function namesAlign(left: string, right: string): boolean {
  const a = foldName(left)
  const b = foldName(right)
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const leftTokens = a.split(" ").filter((token) => token.length >= 4)
  const rightTokens = b.split(" ").filter((token) => token.length >= 4)
  if (leftTokens.length === 0 || rightTokens.length === 0) return false
  const overlap = leftTokens.filter((token) => rightTokens.includes(token))
  return overlap.length >= Math.min(2, leftTokens.length, rightTokens.length)
}

export function classifyPartner(name: string): { kind: TradePartnerKind; canonical: string } {
  const trimmed = name.trim()
  if (!trimmed || /^unpublished$/i.test(trimmed)) {
    return { kind: "unpublished", canonical: "UNPUBLISHED" }
  }
  if (RETAIL_PARCEL.test(trimmed)) return { kind: "retail_parcel", canonical: "AMAZON" }
  if (ZONA.test(trimmed)) return { kind: "zona_libre", canonical: trimmed.toUpperCase() }
  if (LOGISTICS.test(trimmed)) return { kind: "logistics", canonical: trimmed.toUpperCase() }
  const canon = PARTNER_CANON.find((row) => row.re.test(trimmed))
  if (canon) {
    if (MASS_BRANDS.some((row) => row.re.test(trimmed)) || PRO_BRANDS.some((row) => row.re.test(trimmed))) {
      return { kind: "affiliate", canonical: canon.name }
    }
    return { kind: "factory", canonical: canon.name }
  }
  if (MASS_BRANDS.some((row) => row.re.test(trimmed)) || PRO_BRANDS.some((row) => row.re.test(trimmed))) {
    return { kind: "affiliate", canonical: trimmed.toUpperCase() }
  }
  return { kind: "factory", canonical: trimmed.toUpperCase() }
}

export function classifyCargo(description: string): TradeCargoKind {
  const text = description.toLowerCase()
  if (/\bmuestra|sample\b|\b\d+\s*ml muestra/.test(text) || /\b6\s*ml\b/.test(text)) return "sample"
  if (/gorros de shampoo|gorro/.test(text)) return "noise"
  if (/champiojo|gamabenceno|piojos|quassia|uso externo/.test(text)) return "medicated"
  if (/\b30\s*ml\b|guest supply|hotel/.test(text)) return "hotel_amenity"
  return "shampoo"
}

function occupiedFrom(partners: TradePartner[], description: string): { brands: string[]; share: number } {
  const brands = new Set<string>()
  let share = 0
  for (const partner of partners) {
    const hit =
      MASS_BRANDS.find((row) => row.re.test(partner.name)) ??
      PRO_BRANDS.find((row) => row.re.test(partner.name))
    if (!hit) continue
    brands.add(hit.label)
    share += partner.sharePct ?? 0
  }
  for (const row of [...MASS_BRANDS, ...PRO_BRANDS]) {
    if (row.re.test(description)) brands.add(row.label)
  }
  return { brands: [...brands], share: Math.min(100, Math.round(share)) }
}

function logisticsShareOf(partners: TradePartner[]): number {
  const listed = partners.filter((partner) => partner.sharePct != null)
  if (listed.length === 0) {
    const logistics = partners.filter(
      (partner) => partner.kind === "logistics" || partner.kind === "zona_libre"
    ).length
    return partners.length ? Math.round((100 * logistics) / partners.length) : 0
  }
  return Math.min(
    100,
    Math.round(
      listed
        .filter((partner) => partner.kind === "logistics" || partner.kind === "zona_libre")
        .reduce((sum, partner) => sum + (partner.sharePct ?? 0), 0)
    )
  )
}

function brazilHintOf(description: string, partners: TradePartner[]): boolean {
  const blob = `${description} ${partners.map((partner) => partner.name).join(" ")}`
  return /brasil|brazil|nazca|kanechom|skala|\bltda\b/i.test(blob)
}

export function qualityOf(filing: Omit<TradeFiling, "id" | "quality">): TradeFilingQuality {
  if (filing.partners.some((partner) => partner.kind === "retail_parcel") && filing.hsShipments <= 2) {
    return "parcel"
  }
  if (filing.cargo === "sample" || (filing.hsShipments <= 1 && filing.cargo !== "shampoo")) {
    return "sample"
  }
  if (filing.occupiedShare >= 50) return "occupied"
  if (filing.logisticsShare >= 70) return "logistics_only"
  if (filing.hsShipments <= 1) return "sample"
  return "usable"
}

function filingId(importer: string, country: string, hs: string): string {
  return `${foldName(importer) || "importer"}|${foldName(country) || "xx"}|${hs || "hs"}`
}

function finishFiling(
  partial: Omit<TradeFiling, "id" | "quality" | "occupiedBrands" | "occupiedShare" | "logisticsShare" | "brazilHint">
): TradeFiling {
  const occupied = occupiedFrom(partial.partners, partial.description)
  const logisticsShare = logisticsShareOf(partial.partners)
  const brazilHint = brazilHintOf(partial.description, partial.partners)
  const draft = { ...partial, occupiedBrands: occupied.brands, occupiedShare: occupied.share, logisticsShare, brazilHint }
  return {
    ...draft,
    id: filingId(partial.importer, partial.country, partial.hs),
    quality: qualityOf(draft),
  }
}

function parseNumber(value: string): number {
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return 0
  return Number(digits)
}

function isHsLine(line: string): boolean {
  return /^\d{4,12}$/.test(line.replace(/\s/g, ""))
}

function stripTags(line: string): string {
  return line.replace(TAGS, "").replace(/\s+/g, " ").trim()
}

function isChrome(line: string): boolean {
  return !line || CHROME.test(line)
}

export function parseTradeDump(text: string, source: TradeSource = "tradeindata"): TradeFiling[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim())
  const cards: TradeFiling[] = []
  let i = 0
  while (i < lines.length) {
    const role = lines[i].match(/^(.+?)\s+Importer$/i)
    if (!role) {
      i += 1
      continue
    }
    const country = role[1].replace(/\s+Importer$/i, "").trim() || "Unknown"
    let name = ""
    for (let look = i - 1; look >= 0; look -= 1) {
      if (isChrome(lines[look])) continue
      if (/^(description|total shipment|hscode|top trade partners|latest shipments|last trade date)/i.test(lines[look])) {
        break
      }
      name = stripTags(lines[look])
      break
    }
    i += 1
    if (!name || name.length < 3) continue
    let lastTradeDate = ""
    let description = ""
    let hs = ""
    let hsShipments = 0
    let totalShipments = 0
    const partners: TradePartner[] = []
    const latestMonths: string[] = []
    let section:
      | "none"
      | "description"
      | "hs_count"
      | "all_count"
      | "partners"
      | "months"
      | "hscodes" = "none"
    let pendingPartner = ""

    const flushPartner = (raw: string, sharePct?: number) => {
      const label = raw.trim()
      if (!label || isHsLine(label) || isChrome(label)) return
      const classified = classifyPartner(label)
      partners.push({
        name: label,
        sharePct,
        kind: classified.kind,
        canonical: classified.canonical,
      })
    }

    while (i < lines.length) {
      const line = lines[i]
      if (/^.+\s+Importer$/i.test(line) && i > 0) break
      if (/^\d[\d,]* companies in total$/i.test(line)) {
        i += 1
        continue
      }
      const date = line.match(/^Last Trade Date:\s*(.+)$/i)
      if (date) {
        lastTradeDate = date[1].trim()
        i += 1
        continue
      }
      if (/^Description$/i.test(line)) {
        section = "description"
        i += 1
        continue
      }
      if (/^Total Shipment$/i.test(line)) {
        section = hsShipments === 0 ? "hs_count" : "all_count"
        i += 1
        continue
      }
      if (/^Hscode/i.test(line)) {
        section = "hscodes"
        i += 1
        continue
      }
      if (/^Top Trade Partners$/i.test(line)) {
        section = "partners"
        pendingPartner = ""
        i += 1
        continue
      }
      if (/^Latest shipments$/i.test(line)) {
        if (pendingPartner) flushPartner(pendingPartner)
        pendingPartner = ""
        section = "months"
        i += 1
        continue
      }
      if (/^Full Access$/i.test(line) || /^Subscribe to view/i.test(line) || /^contatc icon$/i.test(line)) {
        i += 1
        continue
      }
      if (isChrome(line) && section !== "description") {
        i += 1
        continue
      }
      if (section === "description") {
        if (isHsLine(line) && !hs) {
          hs = line.slice(0, 6)
          i += 1
          continue
        }
        if (line && !/^Total Shipment$/i.test(line)) {
          description = description ? `${description} ${line}` : line
        }
        i += 1
        continue
      }
      if (section === "hs_count") {
        if (isHsLine(line)) {
          i += 1
          continue
        }
        if (/\d/.test(line)) {
          hsShipments = parseNumber(line)
          section = "none"
        }
        i += 1
        continue
      }
      if (section === "all_count") {
        if (/\d/.test(line)) {
          totalShipments = parseNumber(line)
          section = "none"
        }
        i += 1
        continue
      }
      if (section === "partners") {
        if (isHsLine(line)) {
          i += 1
          continue
        }
        const pct = line.match(/^(\d+(?:\.\d+)?)\s*%$/)
        if (pct && pendingPartner) {
          flushPartner(pendingPartner, Number(pct[1]))
          pendingPartner = ""
          i += 1
          continue
        }
        if (pendingPartner) flushPartner(pendingPartner)
        pendingPartner = line
        i += 1
        continue
      }
      if (section === "months") {
        if (/^\d{6}$/.test(line)) latestMonths.push(line)
        i += 1
        continue
      }
      i += 1
    }
    if (pendingPartner) flushPartner(pendingPartner)
    cards.push(
      finishFiling({
        importer: name,
        country,
        lastTradeDate: lastTradeDate || undefined,
        description,
        hs: hs || "330510",
        hsShipments,
        totalShipments,
        partners,
        latestMonths,
        cargo: classifyCargo(description),
        source,
      })
    )
  }
  return dedupeFilings(cards)
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ""
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        current += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      cells.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function headerKey(value: string): string {
  return foldName(value).replace(/\s+/g, "_")
}

export function parseTradeCsv(text: string, source: TradeSource = "csv"): TradeFiling[] {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim()
  const first = raw.split("\n")[0] ?? ""
  const delimiter = first.split(";").length > first.split(",").length ? ";" : ","
  const rows = raw.split("\n").filter((line) => line.trim())
  if (rows.length < 2) return []
  const headers = splitCsvLine(rows[0], delimiter).map(headerKey)
  const index = (aliases: string[]): number =>
    headers.findIndex((header) => aliases.some((alias) => header.includes(alias)))
  const importerAt = index(["importer", "company", "consignee", "name", "empresa"])
  const countryAt = index(["country", "pais", "market"])
  const dateAt = index(["last_trade", "date", "fecha"])
  const descAt = index(["description", "product", "desc"])
  const hsAt = index(["hscode", "hs_code", "hs", "ncm"])
  const hsCountAt = index(["hs_shipment", "shipment_330", "330510"])
  const totalAt = index(["total_shipment", "shipments", "embarque"])
  const partnersAt = index(["partner", "supplier", "exportador"])
  if (importerAt < 0) return []
  const cards: TradeFiling[] = []
  for (const row of rows.slice(1)) {
    const cells = splitCsvLine(row, delimiter)
    const importer = cells[importerAt]?.trim()
    if (!importer) continue
    const description = descAt >= 0 ? cells[descAt] ?? "" : ""
    const partnersRaw = partnersAt >= 0 ? cells[partnersAt] ?? "" : ""
    const partners = partnersRaw
      .split(/[|;]/)
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => {
        const classified = classifyPartner(name)
        return { name, kind: classified.kind, canonical: classified.canonical } satisfies TradePartner
      })
    cards.push(
      finishFiling({
        importer,
        country: countryAt >= 0 ? cells[countryAt] || "Unknown" : "Unknown",
        lastTradeDate: dateAt >= 0 ? cells[dateAt] || undefined : undefined,
        description,
        hs: (hsAt >= 0 ? cells[hsAt] : "330510").replace(/\D/g, "").slice(0, 6) || "330510",
        hsShipments: hsCountAt >= 0 ? parseNumber(cells[hsCountAt] ?? "") : parseNumber(cells[totalAt] ?? ""),
        totalShipments: totalAt >= 0 ? parseNumber(cells[totalAt] ?? "") : 0,
        partners,
        latestMonths: [],
        cargo: classifyCargo(description),
        source,
      })
    )
  }
  return dedupeFilings(cards)
}

export function looksLikeCsv(text: string): boolean {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) ?? ""
  if (!first.includes(",") && !first.includes(";")) return false
  return /importer|company|consignee|hscode|hs code|shipment/i.test(first)
}

export function parseTradeInput(text: string, source?: TradeSource): TradeFiling[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (source === "csv" || looksLikeCsv(trimmed)) return parseTradeCsv(trimmed, source ?? "csv")
  return parseTradeDump(trimmed, source ?? "tradeindata")
}

function dedupeFilings(rows: TradeFiling[]): TradeFiling[] {
  const byId = new Map<string, TradeFiling>()
  for (const row of rows) {
    const previous = byId.get(row.id)
    if (!previous || row.hsShipments > previous.hsShipments) byId.set(row.id, row)
  }
  return [...byId.values()]
}

export function filingCountsAsPurchase(match: TradeFilingMatch): boolean {
  if (match.quality === "parcel" || match.quality === "sample") return false
  if (match.hsShipments < 3 && match.quality !== "occupied") return false
  if (match.lastTradeDate) {
    const stamp = Date.parse(match.lastTradeDate)
    if (!Number.isNaN(stamp) && Date.now() - stamp > 24 * 30 * 24 * 60 * 60 * 1000) return false
  }
  return match.cargo === "shampoo" || match.cargo === "hotel_amenity" || match.cargo === "medicated"
}

export function filingBlocksBestFit(match: TradeFilingMatch): boolean {
  return match.quality === "occupied" || match.occupiedShare >= 50
}

function hsMatchesBrief(hs: string, brief?: Brief): boolean {
  const wanted = (brief?.hsCode ?? "").replace(/\D/g, "")
  if (!wanted) return true
  return hs.startsWith(wanted) || wanted.startsWith(hs.slice(0, Math.min(4, wanted.length)))
}

function countryAlign(lead: Lead, filing: TradeFiling): boolean {
  const place = foldName(`${lead.market ?? ""} ${lead.country ?? ""} ${lead.extraction?.country ?? ""}`)
  const market = foldName(filing.country)
  if (!place || !market) return true
  return place.includes(market) || market.includes(place)
}

export function matchFiling(lead: Lead, records: TradeFiling[], brief?: Brief): TradeFilingMatch | undefined {
  const hits = records.filter(
    (row) => namesAlign(lead.name, row.importer) && countryAlign(lead, row) && hsMatchesBrief(row.hs, brief)
  )
  if (hits.length === 0) {
    const loose = records.filter((row) => namesAlign(lead.name, row.importer) && hsMatchesBrief(row.hs, brief))
    if (loose.length === 0) return undefined
    return toMatch(loose.sort((a, b) => b.hsShipments - a.hsShipments)[0])
  }
  return toMatch(hits.sort((a, b) => b.hsShipments - a.hsShipments)[0])
}

function monthStamp(month: string): string | undefined {
  if (!/^\d{6}$/.test(month)) return undefined
  return `${month.slice(0, 4)}-${month.slice(4, 6)}-01`
}

export function toMatch(filing: TradeFiling): TradeFilingMatch {
  const lastMonth = filing.latestMonths.at(-1)
  const note = filingNote(filing)
  return {
    recordId: filing.id,
    importer: filing.importer,
    hs: filing.hs,
    hsShipments: filing.hsShipments,
    lastTradeDate: filing.lastTradeDate || monthStamp(lastMonth ?? ""),
    cargo: filing.cargo,
    quality: filing.quality,
    occupiedBrands: filing.occupiedBrands,
    occupiedShare: filing.occupiedShare,
    partners: filing.partners,
    description: filing.description,
    latestMonths: filing.latestMonths,
    brazilHint: filing.brazilHint,
    logisticsShare: filing.logisticsShare,
    note,
  }
}

export function filingNote(filing: Pick<TradeFiling, "hs" | "hsShipments" | "lastTradeDate" | "partners" | "quality" | "occupiedBrands" | "cargo" | "description" | "brazilHint" | "logisticsShare">): string {
  const top = filing.partners
    .slice(0, 3)
    .map((partner) =>
      partner.sharePct != null ? `${partner.canonical ?? partner.name} ${partner.sharePct}%` : partner.canonical ?? partner.name
    )
    .join(", ")
  const bits = [
    `${filing.hsShipments} embarques HS ${filing.hs}`,
    filing.lastTradeDate ? `último ${filing.lastTradeDate.slice(0, 10)}` : "",
    filing.cargo !== "shampoo" ? filing.cargo.replace("_", " ") : "",
    top ? `parceiros: ${top}` : "",
    filing.quality === "occupied" && filing.occupiedBrands.length
      ? `livro ocupado (${filing.occupiedBrands.join(", ")})`
      : "",
    filing.quality === "logistics_only" ? "parceiros são logística, não fábrica" : "",
    filing.quality === "parcel" ? "parcela Amazon, não distribuidor" : "",
    filing.brazilHint ? "menciona origem Brasil" : "",
  ].filter(Boolean)
  return clip(bits.join(". ") + ".", 280)
}

export function filingCommerceSignal(match: TradeFilingMatch): CommerceSignal {
  return {
    kind: "customs",
    source: "trade_record",
    title: `TradeInData HS ${match.hs} · ${match.importer}`,
    url: `tradeindata:${match.recordId}`,
    publishedAt: match.lastTradeDate,
    quote: match.note,
  }
}

export function mergeFilingCommerce(
  commerce: CommerceSnapshot | undefined,
  match: TradeFilingMatch
): CommerceSnapshot {
  const signal = filingCommerceSignal(match)
  const existing = commerce ?? { fetchedAt: new Date().toISOString(), signals: [] }
  const signals = [
    signal,
    ...existing.signals.filter(
      (item) => !(item.source === "trade_record" && item.kind === "customs" && item.url === signal.url)
    ),
  ]
  return { ...existing, fetchedAt: existing.fetchedAt || new Date().toISOString(), signals }
}

export function applyFilingToLead(lead: Lead, records: TradeFiling[], brief?: Brief): Lead {
  const match = matchFiling(lead, records, brief)
  lead.filingChecked = true
  if (!match) {
    if (lead.filing) {
      lead.filing = undefined
      if (lead.commerce) {
        lead.commerce = {
          ...lead.commerce,
          signals: lead.commerce.signals.filter((item) => item.source !== "trade_record"),
        }
      }
    }
    return lead
  }
  lead.filing = match
  lead.commerce = mergeFilingCommerce(lead.commerce, match)
  return lead
}

export function qualityLabel(quality: TradeFilingQuality): string {
  if (quality === "usable") return "indicação — conferir"
  if (quality === "occupied") return "indicação de livro ocupado"
  if (quality === "logistics_only") return "só logística"
  if (quality === "parcel") return "parcela varejo"
  return "amostra / ruído"
}

const GLOBAL_IMPORTER =
  /\b(unilever|avon|genomma|genonna|pricesmart|procter|feduro|l'?oreal|loreal|alfa parf|alfaparf|belcorp|\bl\.?\s*bel\b|mesoestetic|arabela)\b/i

export function isLogisticsName(name: string): boolean {
  return LOGISTICS.test(name) || ZONA.test(name)
}

export function isGlobalBrandImporter(name: string): boolean {
  return GLOBAL_IMPORTER.test(name)
}

/** Names worth sending to Exa to confirm. Logistics and captive global brands stay out. */
export function isSearchCandidate(filing: TradeFiling): boolean {
  if (isLogisticsName(filing.importer)) return false
  if (isGlobalBrandImporter(filing.importer)) return false
  if (filing.quality === "parcel" || filing.quality === "sample") return false
  if (filing.cargo === "noise") return false
  return true
}

export function cargoLabel(cargo: TradeCargoKind): string {
  if (cargo === "shampoo") return "shampoo"
  if (cargo === "sample") return "amostra"
  if (cargo === "hotel_amenity") return "amenity hotel"
  if (cargo === "medicated") return "medicado"
  return "ruído"
}

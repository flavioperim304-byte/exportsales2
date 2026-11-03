import type {
  Brief,
  CommerceSignal,
  CommerceSnapshot,
  Lead,
  TradeCargoKind,
  TradeFiling,
  TradeFilingMatch,
  TradeFilingQuality,
  TradeHsCode,
  TradePartner,
  TradePartnerKind,
  TradeSource,
} from "./types"
import { clip } from "./text"

const LEGAL =
  /\b(s\.?a\.?|s\.?a\.?\s*de\s*c\.?v\.?|inc\.?|corp\.?|ltda?\.?|llc|co\.?|company|sas|srl|gmbh|ag)\b/gi

const CHROME =
  /^(port of (?:discharge|loading)|enter port of|trade time|select|weight|kg|-|amount|\$|search method|smart search|strict search|exclude logistics companies|yes|no|sort order|smart order|shipments|recently|search|bulk|download|full access|subscribe to view.*|contatc icon|\d[\d,]* companies in total|view details|follow|company data|product data|bill of lading|countries covered|product analysis|pricing|api)$/i

const REDACTED = /^\*+$|^\.+$|^[x]{4,}$|^[•·.*…]{3,}$/i

const HS_HEADING =
  /las dem[aá]s|preparaciones capilares|aceites esenciales y resinoides|other hair preparation|preparations for use on the hair/i

const HS_SPECIFIC = /\b(henna|shampoo|champ[uú]|keratin|queratin|lote|skala|nazca|glb)\b|\d+\s*ml/i

const TEMPLATE_DESC =
  /shipper_description|hscd_description|consignee_description|notify_description|hscd_/i

const TAGS = /\b(high-transaction enterprise|leading enterprise|new enterprise)\b/gi

const LOGISTICS =
  /\b(logistic|logistics|freight|forwarder|shipping|courier|starlogic|amcar|o\s*&\s*m\s+logistic|ag logistics|\bag\b|nur logistic|\bdhl\b)\b/i

const ZONA = /\b(zona libre|colon free|z\.?l\.?s?\.?a)\b/i

const RETAIL_PARCEL = /\bamazon\b/i

const MASS_BRANDS: { re: RegExp; label: string }[] = [
  { re: /\bunilever\b/i, label: "Unilever" },
  { re: /\bprocter\b|\bp&g\b|\bprocter\s*&?\s*gamble\b/i, label: "P&G" },
  { re: /\bavon\b/i, label: "Avon" },
  { re: /\bgenomma|genonna\b/i, label: "Genomma" },
  { re: /\bbelcorp|\bbel star\b|\bl\.?\s*bel\b/i, label: "Belcorp" },
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

export function isHsHeadingText(description: string): boolean {
  return HS_HEADING.test(description) && !HS_SPECIFIC.test(description)
}

function headerHs(line: string, label: string): { hit: boolean; hs: string } {
  const match = line.match(new RegExp(`^${label}(?:\\s*[|:]\\s*|\\s+)?(\\d{4,12})?$`, "i"))
  if (!match) return { hit: false, hs: "" }
  return { hit: true, hs: (match[1] ?? "").replace(/\D/g, "").slice(0, 6) }
}

export function classifyCargo(description: string, hs = ""): TradeCargoKind {
  if (TEMPLATE_DESC.test(description)) return "noise"
  const text = description.toLowerCase()
  if (/\bmuestra|sample\b|\b\d+\s*ml muestra/.test(text) || /\b6\s*ml\b/.test(text)) return "sample"
  if (/gorros de shampoo|gorro/.test(text)) return "noise"
  if (/champiojo|gamabenceno|piojos|quassia|uso externo/.test(text)) return "medicated"
  if (/\b30\s*ml\b|guest supply|hotel/.test(text)) return "hotel_amenity"
  if (/shampoo|champ[uú]|capilar|hair\s*care|condicionador|keratin|queratin/.test(text)) return "shampoo"
  if (hs.startsWith("3305")) return "shampoo"
  if (!text.trim()) return hs ? "other" : "noise"
  return "other"
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
  const volume =
    filing.hsShipments ||
    (filing.hsCodes ?? []).reduce((sum, row) => sum + row.shipments, 0) ||
    filing.totalShipments
  if (filing.partners.some((partner) => partner.kind === "retail_parcel") && volume <= 2) {
    return "parcel"
  }
  if (filing.cargo === "sample" || (volume <= 1 && filing.cargo !== "shampoo")) {
    return "sample"
  }
  if (filing.occupiedShare >= 50) return "occupied"
  if (filing.logisticsShare >= 70) return "logistics_only"
  if (volume <= 1) return "sample"
  return "usable"
}

function filingId(importer: string, country: string, hs: string): string {
  return `${foldName(importer) || "importer"}|${foldName(country) || "xx"}|${hs || "hs"}`
}

function pickPrimaryHs(hs: string, codes: TradeHsCode[], hsShipments: number): { hs: string; hsShipments: number } {
  if (hs && hsShipments > 0) return { hs, hsShipments }
  const ranked = [...codes].sort((left, right) => right.shipments - left.shipments)
  const match = hs
    ? codes.find((row) => row.code === hs || row.code.startsWith(hs) || hs.startsWith(row.code))
    : undefined
  if (hs) return { hs, hsShipments: hsShipments || match?.shipments || 0 }
  const hair = ranked.find((row) => row.code.startsWith("3305"))
  const chosen = hair || ranked[0]
  if (!chosen) return { hs: "", hsShipments }
  return { hs: chosen.code, hsShipments: chosen.shipments }
}

function finishFiling(
  partial: Omit<TradeFiling, "id" | "quality" | "occupiedBrands" | "occupiedShare" | "logisticsShare" | "brazilHint">
): TradeFiling {
  const occupied = occupiedFrom(partial.partners, partial.description)
  const logisticsShare = logisticsShareOf(partial.partners)
  const brazilHint = brazilHintOf(partial.description, partial.partners)
  const picked = pickPrimaryHs(partial.hs, partial.hsCodes ?? [], partial.hsShipments)
  const draft = {
    ...partial,
    country: normalizeCountry(partial.country),
    hs: picked.hs,
    hsShipments: picked.hsShipments,
    hsCodes: partial.hsCodes ?? [],
    tradingCountries: partial.tradingCountries ?? [],
    ports: partial.ports ?? [],
    originsRedacted: partial.originsRedacted ?? false,
    portsRedacted: partial.portsRedacted ?? false,
    partnersRedacted: partial.partnersRedacted ?? false,
    headingOnly: partial.headingOnly ?? isHsHeadingText(partial.description),
    cargo: partial.cargo || classifyCargo(partial.description, picked.hs),
    occupiedBrands: occupied.brands,
    occupiedShare: occupied.share,
    logisticsShare,
    brazilHint,
  }
  return {
    ...draft,
    id: filingId(draft.importer, draft.country, draft.hs),
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

export function parseTradeDump(text: string, source: TradeSource = "tradeindata", sourceFile?: string): TradeFiling[] {
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
      if (isChrome(lines[look]) || REDACTED.test(lines[look])) continue
      if (/^(description|products|total shipment|hscode|top trade|top 5 ports|latest shipments|shipments over|last trade date)/i.test(lines[look])) {
        continue
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
    const hsCodes: TradeHsCode[] = []
    const tradingCountries: string[] = []
    const ports: string[] = []
    let originsRedacted = false
    let portsRedacted = false
    let partnersRedacted = false
    let section:
      | "none"
      | "description"
      | "shipment_value"
      | "partners"
      | "months"
      | "hscodes"
      | "countries"
      | "ports" = "none"
    let pendingPartner = ""
    let pendingHs = ""
    let shipmentSawHs = false

    const flushPartner = (raw: string, sharePct?: number) => {
      const label = raw.trim()
      if (!label || label.length < 4 || /^\d+$/.test(label) || isHsLine(label) || isChrome(label) || REDACTED.test(label)) return
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
      const described = headerHs(line, "Description")
      const products = headerHs(line, "Products")
      if (described.hit || products.hit) {
        section = "description"
        if ((described.hs || products.hs) && !hs) hs = described.hs || products.hs
        i += 1
        continue
      }
      const shipped = headerHs(line, "Total Shipment")
      if (shipped.hit) {
        section = "shipment_value"
        shipmentSawHs = Boolean(shipped.hs)
        if (shipped.hs && !hs) hs = shipped.hs
        i += 1
        continue
      }
      if (/^Hscode/i.test(line)) {
        section = "hscodes"
        pendingHs = ""
        i += 1
        continue
      }
      const partnersHeader = headerHs(line, "Top Trade Partners")
      if (partnersHeader.hit) {
        section = "partners"
        pendingPartner = ""
        i += 1
        continue
      }
      if (/^Top Trading Countries$/i.test(line)) {
        section = "countries"
        i += 1
        continue
      }
      if (/^Top 5 Ports$/i.test(line) || /^Top Ports$/i.test(line)) {
        section = "ports"
        i += 1
        continue
      }
      const latest = headerHs(line, "Latest shipments")
      if (latest.hit || /^Shipments over the last/i.test(line)) {
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
          hs = line.replace(/\D/g, "").slice(0, 6)
          i += 1
          continue
        }
        if (line && !/^Total Shipment$/i.test(line) && !REDACTED.test(line)) {
          description = description ? `${description} ${line}` : line
        }
        i += 1
        continue
      }
      if (section === "shipment_value") {
        if (isHsLine(line)) {
          shipmentSawHs = true
          i += 1
          continue
        }
        if (/\d/.test(line)) {
          const count = parseNumber(line)
          if (shipmentSawHs && hsShipments === 0) hsShipments = count
          else totalShipments = Math.max(totalShipments, count)
          section = "none"
        }
        i += 1
        continue
      }
      if (section === "hscodes") {
        if (isHsLine(line)) {
          pendingHs = line.replace(/\D/g, "").slice(0, 6)
          i += 1
          continue
        }
        const total = line.match(/^Total:\s*([\d,.]+)/i)
        if (total && pendingHs) {
          hsCodes.push({ code: pendingHs, shipments: parseNumber(total[1]) })
          pendingHs = ""
          i += 1
          continue
        }
        i += 1
        continue
      }
      if (section === "partners") {
        if (REDACTED.test(line)) {
          partnersRedacted = true
          i += 1
          continue
        }
        if (isHsLine(line) || /^\d{4}\s+\d{2}$/.test(line)) {
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
      if (section === "countries") {
        if (REDACTED.test(line)) originsRedacted = true
        else if (line && !isHsLine(line) && !isChrome(line) && !/^\d/.test(line)) {
          tradingCountries.push(line)
        }
        i += 1
        continue
      }
      if (section === "ports") {
        if (REDACTED.test(line)) portsRedacted = true
        else if (line && !isHsLine(line) && !isChrome(line) && !/^\d{6}$/.test(line)) {
          ports.push(line)
        }
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
    const primary = pickPrimaryHs(hs, hsCodes, hsShipments)
    cards.push(
      finishFiling({
        importer: name,
        country,
        lastTradeDate: lastTradeDate || undefined,
        description,
        hs: primary.hs,
        hsShipments: primary.hsShipments,
        totalShipments,
        partners,
        latestMonths,
        hsCodes,
        tradingCountries,
        ports,
        originsRedacted,
        portsRedacted,
        partnersRedacted,
        headingOnly: isHsHeadingText(description),
        cargo: classifyCargo(description, primary.hs),
        source,
        sourceFile,
      })
    )
  }
  return stampFileCountry(dedupeFilings(cards), sourceFile)
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

export function parseTradeCsv(text: string, source: TradeSource = "csv", sourceFile?: string): TradeFiling[] {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim()
  const first = raw.split("\n")[0] ?? ""
  const delimiter = first.split(";").length > first.split(",").length ? ";" : ","
  const rows = raw.split("\n").filter((line) => line.trim())
  if (rows.length < 2) return []
  const headers = splitCsvLine(rows[0], delimiter).map(headerKey)
  const index = (aliases: string[]): number =>
    headers.findIndex((header) => aliases.some((alias) => header.includes(alias)))
  const importerAt = index(["importer_name", "company_name", "consignee", "importer", "empresa", "company", "name"])
  const countryAt = index(["country", "pais", "market", "nation"])
  const dateAt = index(["last_trade_date", "last_trade", "trade_date", "fecha", "date"])
  const descAt = index(["description", "product", "cargo", "desc"])
  const hsAt = index(["hscode", "hs_code", "hs", "ncm"])
  const hsCountAt = index(["hs_shipment", "shipment_330", "330510"])
  const totalAt = index(["total_shipment", "shipments", "embarque"])
  const partnersAt = index(["partner", "supplier", "exportador", "shipper"])
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
        cargo: classifyCargo(description, (hsAt >= 0 ? cells[hsAt] : "").replace(/\D/g, "").slice(0, 6)),
        hsCodes: [],
        tradingCountries: [],
        ports: [],
        originsRedacted: false,
        portsRedacted: false,
        partnersRedacted: false,
        headingOnly: isHsHeadingText(description),
        source,
        sourceFile,
      })
    )
  }
  return stampFileCountry(dedupeFilings(cards), sourceFile)
}

const FILE_COUNTRY: { re: RegExp; country: string }[] = [
  { re: /austsham|australia|\baust\b|\bau\b/i, country: "Australia" },
  { re: /\bjapan\b|\bjap\b/i, country: "Japan" },
  { re: /hong\s*kong|\bhk\b/i, country: "Hong Kong" },
  { re: /uzbekistan|\buz\b/i, country: "Uzbekistan" },
  { re: /germany|\bger\b/i, country: "Germany" },
  { re: /united\s*arab|\buae\b|dubai|emirates/i, country: "United Arab Emirates" },
  { re: /panama/i, country: "Panama" },
  { re: /bolivia/i, country: "Bolivia" },
  { re: /chile|\bch\b/i, country: "Chile" },
  { re: /colombia|\bco\b/i, country: "Colombia" },
  { re: /dominican|\bdr\b/i, country: "Dominican Republic" },
  { re: /south\s*africa|safrica/i, country: "South Africa" },
  { re: /madagascar|madag/i, country: "Madagascar" },
  { re: /zambia|\bzam\b/i, country: "Zambia" },
  { re: /uganda|\buga\b/i, country: "Uganda" },
  { re: /libya|\blyb\b/i, country: "Libya" },
  { re: /botswana|botsw/i, country: "Botswana" },
  { re: /mauritius|\bmaur\b/i, country: "Mauritius" },
  { re: /kenya|\bken\b/i, country: "Kenya" },
  { re: /algeria|\bal\s*2\b/i, country: "Algeria" },
  { re: /senegal|\bsene\b/i, country: "Senegal" },
  { re: /south\s*sudan/i, country: "South Sudan" },
  { re: /sudan/i, country: "Sudan" },
  { re: /italy|italia/i, country: "Italy" },
  { re: /uruguay|\buru\b/i, country: "Uruguay" },
  { re: /ireland|\bir\b/i, country: "Ireland" },
  { re: /turkey|\btk\b/i, country: "Turkey" },
  { re: /switzerland|\bsw\b/i, country: "Switzerland" },
  { re: /canada|\bcan\b/i, country: "Canada" },
  { re: /nicaragua|\bnic\b/i, country: "Nicaragua" },
  { re: /russia|\brus\b/i, country: "Russia" },
  { re: /ethiopia|\bety\b|\bet\b/i, country: "Ethiopia" },
  { re: /costa\s*rica|\bcr\b/i, country: "Costa Rica" },
  { re: /paraguay|\bpar\b/i, country: "Paraguay" },
  { re: /belgium|\bbe\b/i, country: "Belgium" },
  { re: /mozambique|\bmoz\b/i, country: "Mozambique" },
  { re: /guatemala|\bgua\b/i, country: "Guatemala" },
  { re: /mexico|\bmex\b/i, country: "Mexico" },
  { re: /mauritania/i, country: "Mauritania" },
  { re: /argentina/i, country: "Argentina" },
  { re: /netherlands|\bneth\b/i, country: "Netherlands" },
  { re: /romania|\brom\b/i, country: "Romania" },
  { re: /ivoire|\bciv\b|ivory\s*coast/i, country: "Cote d'Ivoire" },
  { re: /indonesia|\bindo\b/i, country: "Indonesia" },
  { re: /\bperu\b|\bpe\b/i, country: "Peru" },
  { re: /repdom|dominican/i, country: "Dominican Republic" },
  { re: /portugal|\bport\b/i, country: "Portugal" },
  { re: /\bbolivia\b|\bbo\b/i, country: "Bolivia" },
  { re: /bulgaria|\bbul\b/i, country: "Bulgaria" },
  { re: /spain|espanha|españa/i, country: "Spain" },
  { re: /iraq/i, country: "Iraq" },
  { re: /pakistan|\bpk\b/i, country: "Pakistan" },
  { re: /greece|\bgree\b/i, country: "Greece" },
  { re: /france|\bfra\b/i, country: "France" },
  { re: /ecuador|\becua\b/i, country: "Ecuador" },
  { re: /morocco|\bmo\b/i, country: "Morocco" },
]

const COUNTRY_ALIAS: { re: RegExp; country: string }[] = [
  { re: /hong\s*kong/i, country: "Hong Kong" },
  { re: /state of libya|libya/i, country: "Libya" },
  { re: /south\s*africa/i, country: "South Africa" },
  { re: /united\s*states|\busa\b/i, country: "United States" },
  { re: /south\s*sudan/i, country: "South Sudan" },
  { re: /ivoire|ivory\s*coast/i, country: "Cote d'Ivoire" },
]

export function normalizeCountry(country: string): string {
  const trimmed = country.trim()
  if (!trimmed || trimmed === "Unknown") return trimmed || "Unknown"
  const hit = COUNTRY_ALIAS.find((row) => row.re.test(trimmed))
  return hit?.country ?? trimmed
}

export function countryFromFilename(name: string): string {
  const stem = name
    .split(/[/\\]/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim()
  if (!stem) return ""
  const hit = FILE_COUNTRY.find((row) => row.re.test(stem))
  return hit?.country ?? ""
}

export function stampFileCountry(rows: TradeFiling[], sourceFile?: string): TradeFiling[] {
  const guessed = sourceFile ? countryFromFilename(sourceFile) : ""
  if (!guessed) return rows
  return rows.map((row) => {
    if (row.country && row.country !== "Unknown") return row
    return { ...row, country: guessed, id: filingId(row.importer, guessed, row.hs) }
  })
}

export function looksLikeCsv(text: string): boolean {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) ?? ""
  if (!first.includes(",") && !first.includes(";")) return false
  return /importer|company|consignee|hscode|hs code|shipment/i.test(first)
}

export function looksLikeBl(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\t.+/m.test(text) && /\d+(?:\.\d+)?\s*KG/i.test(text)
}

function blHs(description: string): string {
  const coded = description.match(/hs(?:\s*code)?\s*:?\s*(\d{4,12})/i)
  if (coded) return coded[1].replace(/\D/g, "").slice(0, 6)
  const hair = description.match(/\b(3305\d{2,})\b/)
  if (hair) return hair[1].replace(/\D/g, "").slice(0, 6)
  return "330590"
}

function blKg(text: string): number {
  const match = text.match(/([\d.]+)\s*KG/i)
  return match ? Number(match[1]) : 0
}

export function parseTradeBl(text: string, sourceFile?: string): TradeFiling[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  type Raw = { date: string; importer: string; body: string[] }
  const raw: Raw[] = []
  let current: Raw | null = null
  for (const line of lines) {
    const start = line.match(/^(\d{4}-\d{2}-\d{2})\t+(.+)$/)
    if (start) {
      if (current) raw.push(current)
      current = { date: start[1], importer: start[2].trim(), body: [] }
      continue
    }
    if (current) current.body.push(line)
  }
  if (current) raw.push(current)
  const cards: TradeFiling[] = []
  for (const row of raw) {
    const importer = row.importer.replace(/\s+/g, " ").trim()
    if (!importer || /^unpublished$/i.test(importer) || importer.length < 3) continue
    const blob = row.body.join("\n")
    const countryLine = row.body.find((line) => /^[A-Z][A-Za-z .,'()]+\t/.test(line) || /^[A-Z][A-Za-z .,'()]+$/.test(line.trim()))
    const country = normalizeCountry((countryLine?.split("\t")[0] || "").trim() || "Unknown")
    const description = row.body
      .map((line) => line.replace(/\t/g, " ").replace(/\s+/g, " ").trim())
      .filter((line) => line && !/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(line))
      .slice(-1)[0] || blob.replace(/\t/g, " ")
    const kg = blKg(blob)
    const hs = blHs(`${description} ${blob}`)
    const shipper = row.body
      .map((line) => line.split("\t")[1]?.trim() || "")
      .find((name) => name.length > 3 && !/^unpublished$/i.test(name) && !/\d+\s*KG/i.test(name))
    const partners = shipper
      ? [
          {
            name: shipper,
            kind: classifyPartner(shipper).kind,
            canonical: classifyPartner(shipper).canonical,
          } satisfies TradePartner,
        ]
      : []
    const cargo = kg > 0 && kg < 2 ? "sample" : classifyCargo(description, hs)
    const shipments = kg >= 50 ? 2 : 1
    cards.push(
      finishFiling({
        importer,
        country,
        lastTradeDate: row.date,
        description: description.slice(0, 280),
        hs,
        hsShipments: shipments,
        totalShipments: shipments,
        partners,
        latestMonths: [row.date.replace(/-/g, "").slice(0, 6)],
        cargo,
        hsCodes: [{ code: hs, shipments: 1 }],
        tradingCountries: [],
        ports: [],
        originsRedacted: /unpublished/i.test(blob),
        portsRedacted: false,
        partnersRedacted: /unpublished/i.test(shipper || ""),
        headingOnly: isHsHeadingText(description),
        source: "tradeindata",
        sourceFile,
      })
    )
  }
  const merged = new Map<string, TradeFiling>()
  for (const row of cards) {
    const previous = merged.get(row.id)
    if (!previous) {
      merged.set(row.id, row)
      continue
    }
    merged.set(row.id, {
      ...previous,
      hsShipments: previous.hsShipments + row.hsShipments,
      totalShipments: previous.totalShipments + row.totalShipments,
      lastTradeDate:
        (row.lastTradeDate || "") > (previous.lastTradeDate || "") ? row.lastTradeDate : previous.lastTradeDate,
      description: previous.description,
    })
  }
  return stampFileCountry([...merged.values()].map((row) => finishFiling(row)), sourceFile)
}

export function parseTradeInput(text: string, source?: TradeSource, sourceFile?: string): TradeFiling[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (source === "csv" || looksLikeCsv(trimmed)) return parseTradeCsv(trimmed, source ?? "csv", sourceFile)
  const dump = parseTradeDump(trimmed, source ?? "tradeindata", sourceFile)
  if (dump.length) return dump
  if (looksLikeBl(trimmed)) return parseTradeBl(trimmed, sourceFile)
  return dump
}

export function isExcelName(name: string): boolean {
  return /\.(xlsx|xlsm|xls|xlsb)$/i.test(name)
}

export type TradeFileResult = {
  name: string
  parsed: number
  added: number
  error?: string
}

export type FilingSummary = {
  total: number
  candidates: number
  excluded: number
  dropRate: number
  drops: Record<Exclude<FilingDropReason, "candidate">, number>
  headingOnly: number
  partnersRedacted: number
  occupied: number
  countries: { country: string; count: number; candidates: number }[]
  files: string[]
  note: string
}

const EMPTY_DROPS: FilingSummary["drops"] = {
  logistics_name: 0,
  global_brand: 0,
  sample: 0,
  parcel: 0,
  cargo_noise: 0,
}

export function dumpWorthNote(summary: Omit<FilingSummary, "note" | "countries" | "files">): string {
  if (summary.total === 0) return "Sem nomes neste arquivo."
  const bits = [
    `${summary.total} nomes. ${summary.excluded} (${summary.dropRate}%) caem antes da API — marca global, logística, amostra, parcela ou ruído. ${summary.candidates} candidatos.`,
  ]
  if (summary.partnersRedacted) {
    bits.push(
      `Parceiros mascarados em ${summary.partnersRedacted}: no plano barato o livro ocupado não aparece, então o lixo visível fica baixo demais.`
    )
  }
  if (summary.headingOnly) {
    bits.push(`${summary.headingOnly} com descrição de nomenclatura HS, não do produto.`)
  }
  bits.push(
    "Isso é lixo visível, não falso de verdade. Falso = Exa rejeita o nome ou a empresa nunca comprou. Quem já comprou de você conta como verdadeiro."
  )
  return bits.join(" ")
}

export function filingSummary(rows: TradeFiling[]): FilingSummary {
  const byCountry = new Map<string, { count: number; candidates: number }>()
  const files = new Set<string>()
  const drops = { ...EMPTY_DROPS }
  let candidates = 0
  let headingOnly = 0
  let partnersRedacted = 0
  let occupied = 0
  for (const row of rows) {
    if (row.sourceFile) files.add(row.sourceFile)
    const reason = dropReason(row)
    if (reason === "candidate") {
      candidates += 1
      if (row.headingOnly) headingOnly += 1
      if (row.partnersRedacted) partnersRedacted += 1
      if (row.quality === "occupied") occupied += 1
    } else {
      drops[reason] += 1
    }
    const current = byCountry.get(row.country) ?? { count: 0, candidates: 0 }
    current.count += 1
    if (reason === "candidate") current.candidates += 1
    byCountry.set(row.country, current)
  }
  const excluded = rows.length - candidates
  const dropRate = rows.length === 0 ? 0 : Math.round((excluded / rows.length) * 100)
  const stats = {
    total: rows.length,
    candidates,
    excluded,
    dropRate,
    drops,
    headingOnly,
    partnersRedacted,
    occupied,
  }
  return {
    ...stats,
    countries: [...byCountry.entries()]
      .map(([country, countryStats]) => ({ country, ...countryStats }))
      .sort((a, b) => b.count - a.count),
    files: [...files].sort(),
    note: dumpWorthNote(stats),
  }
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
    hsCodes: filing.hsCodes,
    tradingCountries: filing.tradingCountries,
    ports: filing.ports,
    originsRedacted: filing.originsRedacted,
    portsRedacted: filing.portsRedacted,
    partnersRedacted: filing.partnersRedacted,
    headingOnly: filing.headingOnly,
    brazilHint: filing.brazilHint,
    logisticsShare: filing.logisticsShare,
    note,
  }
}

export function filingNote(
  filing: Pick<
    TradeFiling,
    | "hs"
    | "hsShipments"
    | "lastTradeDate"
    | "partners"
    | "quality"
    | "occupiedBrands"
    | "cargo"
    | "description"
    | "brazilHint"
    | "logisticsShare"
    | "hsCodes"
    | "tradingCountries"
    | "originsRedacted"
    | "portsRedacted"
    | "partnersRedacted"
    | "headingOnly"
  >
): string {
  const top = filing.partners
    .slice(0, 3)
    .map((partner) =>
      partner.sharePct != null ? `${partner.canonical ?? partner.name} ${partner.sharePct}%` : partner.canonical ?? partner.name
    )
    .join(", ")
  const extraHs = (filing.hsCodes ?? [])
    .map((row) => row.code)
    .filter((code) => code && code !== filing.hs)
    .slice(0, 3)
  const bits = [
    `${filing.hsShipments} embarques HS ${filing.hs}`,
    extraHs.length ? `outros HS ${extraHs.join(", ")}` : "",
    filing.lastTradeDate ? `último ${filing.lastTradeDate.slice(0, 10)}` : "",
    filing.cargo !== "shampoo" ? filing.cargo.replace("_", " ") : "",
    top ? `parceiros: ${top}` : "",
    filing.tradingCountries?.length ? `origens visíveis: ${filing.tradingCountries.slice(0, 3).join(", ")}` : "",
    filing.originsRedacted ? "origem mascarada (***) na página" : "",
    filing.portsRedacted ? "portos mascarados (***)" : "",
    filing.partnersRedacted ? "parceiros mascarados no plano" : "",
    filing.headingOnly ? "descrição é nomenclatura HS, não o produto" : "",
    "ficha Product/Company Data, não BL",
    filing.quality === "occupied" && filing.occupiedBrands.length
      ? `livro ocupado (${filing.occupiedBrands.join(", ")})`
      : "",
    filing.quality === "logistics_only" ? "parceiros são logística, não fábrica" : "",
    filing.quality === "parcel" ? "parcela Amazon, não distribuidor" : "",
    filing.brazilHint ? "menciona origem Brasil" : "",
  ].filter(Boolean)
  return clip(bits.join(". ") + ".", 320)
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
  /\b(unilever|avon|genomma|genonna|pricesmart|procter|feduro|l'?oreal|loreal|alfa parf|alfaparf|belcorp|\bl\.?\s*bel\b|mesoestetic|arabela|henkel|beiersdorf|colgate|natura)/i

export function isLogisticsName(name: string): boolean {
  return LOGISTICS.test(name) || ZONA.test(name)
}

export function isGlobalBrandImporter(name: string): boolean {
  return GLOBAL_IMPORTER.test(name)
}

export type FilingDropReason =
  | "candidate"
  | "logistics_name"
  | "global_brand"
  | "sample"
  | "parcel"
  | "cargo_noise"

export function dropReason(filing: TradeFiling): FilingDropReason {
  if (isLogisticsName(filing.importer)) return "logistics_name"
  if (isGlobalBrandImporter(filing.importer)) return "global_brand"
  if (filing.cargo === "noise") return "cargo_noise"
  if (filing.quality === "parcel") return "parcel"
  if (filing.quality === "sample") return "sample"
  return "candidate"
}

/** Names worth sending to Exa to confirm. Logistics and captive global brands stay out. */
export function isSearchCandidate(filing: TradeFiling): boolean {
  return dropReason(filing) === "candidate"
}

export function cargoLabel(cargo: TradeCargoKind): string {
  if (cargo === "shampoo") return "shampoo"
  if (cargo === "sample") return "amostra"
  if (cargo === "hotel_amenity") return "amenity hotel"
  if (cargo === "medicated") return "medicado"
  if (cargo === "other") return "outro produto"
  return "ruído"
}

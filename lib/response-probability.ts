import { activityKinds, hasRecentActivity } from "./activity"
import { hasCommercialBuyFacts, recentCommerce } from "./commerce"
import { tradeForCountry } from "./comexstat-map"
import { computeFitProbability, hasPublishedBuyFacts } from "./fit-probability"
import { splitList } from "./text"
import type { Brief, Competitor, Lead, ResponseProbability, TradeSnapshot } from "./types"

export type ResponseContext = {
  brief: Brief
  competitors: Competitor[]
  trade?: TradeSnapshot
}

const STOP = new Set(["and", "the", "for", "with", "hair", "care", "de", "e", "do", "da"])

export function mixTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP.has(token))
}

export function mixOverlap(briefProducts: string, lead: Lead): number {
  const wanted = new Set(mixTokens(briefProducts))
  if (wanted.size === 0) return 0
  const have = new Set(
    mixTokens(
      [
        ...(lead.extraction?.sells ?? []),
        ...(lead.extraction?.buys ?? []),
        lead.extraction?.summary || "",
        lead.exa.summary || "",
      ].join(" ")
    )
  )
  let hits = 0
  for (const token of wanted) {
    if (have.has(token)) hits += 1
  }
  return hits / wanted.size
}

function icpPoints(lead: Lead): number {
  const level = lead.context?.icp || lead.openai?.icp
  if (level === "high") return 18
  if (level === "medium") return 10
  return 0
}

function comexPoints(run: ResponseContext, lead: Lead): number {
  const series = tradeForCountry(run.trade, lead.market || lead.country)
  if (!series || series.error) return 0
  const usd = series.years.reduce((sum, year) => sum + year.usdFob, 0)
  if (usd >= 1_000_000) return 10
  if (usd > 0) return 6
  return 0
}

function competitorPoints(run: ResponseContext, lead: Lead): number {
  const market = (lead.market || lead.country || "").toLowerCase()
  if (!market) return 0
  const hits = run.competitors.filter((item) => item.country.toLowerCase().includes(market) || market.includes(item.country.toLowerCase()))
  if (hits.length >= 3) return 8
  if (hits.length > 0) return 5
  return 0
}

function filingPoints(lead: Lead): number {
  const quality = lead.filing?.quality
  if (quality === "usable" || quality === "occupied") return 8
  return 0
}

export function computeResponseProbability(run: ResponseContext, lead: Lead): ResponseProbability {
  const fit = lead.fit ?? computeFitProbability(run.brief, lead, run.competitors)
  const layers: string[] = []
  let score = Math.round(fit.index * 0.22)
  if (score) layers.push(`fit ${fit.level} ${fit.index}/100`)

  const icp = icpPoints(lead)
  if (icp) {
    score += icp
    layers.push(`ICP ${lead.context?.icp || lead.openai?.icp}`)
  }

  const overlap = mixOverlap(run.brief.products, lead)
  if (overlap >= 0.35) {
    score += 12
    layers.push("mix de produtos alinhado")
  } else if (overlap >= 0.12) {
    score += 6
    layers.push("mix parcial")
  }

  const comex = comexPoints(run, lead)
  if (comex) {
    score += comex
    layers.push("Comex Stat com volume ao país")
  }

  const rivals = competitorPoints(run, lead)
  if (rivals) {
    score += rivals
    layers.push("concorrentes no mercado")
  }

  const dump = filingPoints(lead)
  if (dump) {
    score += dump
    layers.push("Aduana/TradeInData (indicação, não compra)")
  }

  const commerce = recentCommerce(lead)
  const hiring = commerce.some((item) => item.kind === "hiring_buy")
  const restock = hasCommercialBuyFacts(lead)
  if (hiring) {
    score += 10
    layers.push("vaga de compras")
  }
  if (restock) {
    score += 8
    layers.push("reposição publicada")
  }

  const kinds = activityKinds(lead)
  const mixChange = kinds.includes("mix_change")
  const socialGrowth = kinds.includes("social_growth")
  if (mixChange) {
    score += 8
    layers.push("mudança de mix (24 meses)")
  }
  if (socialGrowth) {
    score += 6
    layers.push("crescimento em rede social")
  } else if (kinds.includes("social")) {
    score += 3
    layers.push("presença em rede social")
  }

  if (!hasRecentActivity(lead) && commerce.length === 0) {
    score = Math.min(score, 42)
    layers.push("sem sinal público em 24 meses")
  }

  const publishedBuy = hasPublishedBuyFacts(lead) || restock
  if (!publishedBuy) {
    score = Math.min(score, 54)
    layers.push("sem fato publicado de compra — dump/Atlas não sobem para high")
  }

  score = Math.max(0, Math.min(100, score))
  const level: ResponseProbability["level"] =
    score >= 62 && publishedBuy ? "high" : score >= 38 ? "medium" : "low"
  return {
    level,
    score,
    note:
      layers.length > 0
        ? `Probabilidade de resposta ${level} (${score}/100). ${layers.join("; ")}. Não é pedido de compra.`
        : `Probabilidade de resposta ${level} (${score}/100). Pouca evidência cruzada ainda.`,
    layers,
    hiring,
    mixChange,
    socialGrowth,
    computedAt: new Date().toISOString(),
  }
}

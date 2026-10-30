import type { ActivityKind, ActivitySignal, ActivitySnapshot, Brief, Lead } from "./types"
import { ApiError, requestJson } from "./http"
import { asString, clip, domainOf, sameSite } from "./text"

export const ACTIVITY_MONTHS = 18

const SOCIAL =
  /(?:^|\.)(?:instagram|facebook|linkedin|tiktok|youtube|x|twitter)\.com$/i

const LAUNCH =
  /\b(lan[cç]amento|lan[cç]ou|launch(?:ed|ing|es)?|unveiled|new (?:product|line|range|collection|kit))\b/i

const BRAND =
  /\b(nova marca|new brand|signed|exclusive (?:distribution|import|line)|portfolio|portf[oó]lio|added (?:the )?brand)\b/i

const KIND_LABEL: Record<ActivityKind, string> = {
  news: "notícia",
  launch: "lançamento",
  brand: "nova marca",
  social: "rede social",
}

export function activityKindLabel(kind: ActivityKind): string {
  return KIND_LABEL[kind]
}

export function activityWindowStart(now = new Date()): string {
  const start = new Date(now)
  start.setMonth(start.getMonth() - ACTIVITY_MONTHS)
  return start.toISOString()
}

export function activityQuery(lead: Lead, brief: Brief): string {
  const market = lead.market || lead.country || brief.markets
  return [
    `"${lead.name}"`,
    market,
    '(news OR launch OR launched OR "new product" OR "new line" OR "new brand" OR lançamento OR "nova marca" OR Instagram OR LinkedIn OR Facebook)',
  ]
    .filter((part) => part.trim())
    .join(" ")
}

export function classifyActivity(url: string, title: string, text: string): ActivityKind {
  const host = domainOf(url)
  if (SOCIAL.test(host)) return "social"
  const blob = `${title} ${text}`
  if (LAUNCH.test(blob)) return "launch"
  if (BRAND.test(blob)) return "brand"
  return "news"
}

function mentionsCompany(lead: Lead, title: string, url: string, text: string): boolean {
  if (sameSite(url, lead.url) || sameSite(url, lead.domain)) return true
  const hay = `${title} ${url} ${text}`.toLowerCase()
  const tokens = lead.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
  if (tokens.length === 0) {
    const name = lead.name.toLowerCase().trim()
    return Boolean(name) && hay.includes(name)
  }
  return tokens.some((token) => hay.includes(token))
}

function isRecent(publishedAt: string | undefined, fetchedAt: string): boolean {
  if (!publishedAt) return true
  const stamp = Date.parse(publishedAt)
  if (Number.isNaN(stamp)) return true
  const fetched = Date.parse(fetchedAt)
  const end = Number.isNaN(fetched) ? Date.now() : fetched
  return end - stamp <= ACTIVITY_MONTHS * 30 * 24 * 60 * 60 * 1000
}

export function signalsFromSearch(results: unknown[], lead: Lead): ActivitySignal[] {
  if (!Array.isArray(results)) return []
  const seen = new Set<string>()
  const signals: ActivitySignal[] = []
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
    const kind = classifyActivity(url, title, text)
    if (kind !== "social" && sameSite(url, lead.url)) continue
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
  return signals.slice(0, 8)
}

export function recentSignals(activity: ActivitySnapshot | undefined): ActivitySignal[] {
  if (!activity) return []
  return activity.signals.filter((signal) => isRecent(signal.publishedAt, activity.fetchedAt))
}

export function hasRecentActivity(lead: Lead): boolean {
  return recentSignals(lead.activity).length > 0
}

export function activityKinds(lead: Lead): ActivityKind[] {
  return [...new Set(recentSignals(lead.activity).map((signal) => signal.kind))]
}

export function activityLine(lead: Lead): string {
  if (!lead.activity) return "Public activity has not been searched."
  if (lead.activity.error && lead.activity.signals.length === 0) {
    return `Public activity search failed. ${lead.activity.error}`
  }
  const recent = recentSignals(lead.activity)
  if (recent.length === 0) {
    return `No news, product launch, new brand, or social activity in the last ${ACTIVITY_MONTHS} months.`
  }
  const kinds = activityKinds(lead).map(activityKindLabel).join(", ")
  return `${recent.length} public ${recent.length === 1 ? "signal" : "signals"} in the last ${ACTIVITY_MONTHS} months: ${kinds}.`
}

export function emptyActivity(error?: string): ActivitySnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    signals: [],
    error,
  }
}

export async function searchActivity(lead: Lead, brief: Brief, key: string): Promise<ActivitySnapshot> {
  const data = await requestJson("https://api.exa.ai/search", {
    method: "POST",
    timeoutMs: 25000,
    headers: { Authorization: `Bearer ${key}`, "x-api-key": key },
    body: JSON.stringify({
      query: activityQuery(lead, brief),
      type: "auto",
      numResults: 8,
      startPublishedDate: activityWindowStart(),
      contents: {
        text: { maxCharacters: 400 },
        highlights: { maxHighlights: 1, maxCharacters: 180 },
      },
    }),
  })
  const results = (data as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) {
    throw new ApiError("Exa activity search did not return results.", 502)
  }
  return {
    fetchedAt: new Date().toISOString(),
    signals: signalsFromSearch(results, lead),
  }
}

import {
  aggregateMonths,
  canonicalCountry,
  foldCountry,
  parseHsCode,
  resolveCountry,
  tradePeriod,
  type HsFilter,
} from "./comexstat-map"
import { requestJson } from "./http"
import type { CountryTrade, TradeSnapshot, TradeYear } from "./types"

export {
  aggregateMonths,
  canonicalCountry,
  countriesForTrade,
  formatKg,
  formatUsd,
  parseHsCode,
  resolveCountry,
  tradeForCountry,
  tradePeriod,
  yearLabel,
} from "./comexstat-map"

const COMEXSTAT_GENERAL = "https://api-comexstat.mdic.gov.br/general?language=en"
const SOURCE = "Comex Stat"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function postGeneral(body: unknown, attempt = 0): Promise<unknown> {
  try {
    return await requestJson(COMEXSTAT_GENERAL, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 60000,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (attempt < 3 && /\b429\b/.test(message)) {
      await sleep(11000)
      return postGeneral(body, attempt + 1)
    }
    throw error
  }
}

function emptyYears(period: { years: number[] }): TradeYear[] {
  return period.years.map((year) => ({ year, usdFob: 0, kg: 0, months: 0 }))
}

export async function brazilExports(hsCode: string, countryNames: string[], now = new Date()): Promise<TradeSnapshot> {
  const parsed = parseHsCode(hsCode)
  const fetchedAt = now.toISOString()
  const period = tradePeriod(now)
  if ("error" in parsed) {
    return {
      hsCode: hsCode.trim(),
      hsFilter: "heading",
      hsLabel: "",
      periodFrom: period.from,
      periodTo: period.to,
      source: SOURCE,
      countries: [],
      error: parsed.error,
      fetchedAt,
    }
  }
  const unique = [...new Set(countryNames.map((name) => name.trim()).filter(Boolean))]
  const resolved: { asked: string; id: string; name: string }[] = []
  const missing: CountryTrade[] = []
  for (const asked of unique) {
    const hit = resolveCountry(asked)
    if (!hit) {
      missing.push({
        country: asked,
        years: emptyYears(period),
        error: `Comex Stat has no country id for ${asked}.`,
      })
      continue
    }
    resolved.push({ asked, id: hit.id, name: hit.name })
  }
  if (resolved.length === 0) {
    return {
      hsCode: parsed.digits,
      hsFilter: parsed.filter,
      hsLabel: "",
      periodFrom: period.from,
      periodTo: period.to,
      source: SOURCE,
      countries: missing,
      error: missing[0]?.error || "No destination country could be matched.",
      fetchedAt,
    }
  }
  const filter: HsFilter = parsed.filter
  const body = {
    flow: "export",
    monthDetail: true,
    period: { from: period.from, to: period.to },
    filters: [
      { filter: "country", values: resolved.map((item) => Number(item.id)) },
      { filter, values: [parsed.digits] },
    ],
    details: ["country", filter],
    metrics: ["metricFOB", "metricKG"],
  }
  try {
    const payload = (await postGeneral(body)) as {
      data?: { list?: Record<string, string>[] }
    }
    const list = Array.isArray(payload?.data?.list) ? payload.data.list : []
    const label =
      list[0]?.heading ||
      list[0]?.subHeading ||
      list[0]?.chapter ||
      list[0]?.ncm ||
      `HS ${parsed.digits}`
    const byOfficial = new Map<string, Record<string, string>[]>()
    for (const row of list) {
      const name = (row.country || "").trim()
      if (!name) continue
      const key = canonicalCountry(name)
      const bucket = byOfficial.get(key) ?? []
      bucket.push(row)
      byOfficial.set(key, bucket)
    }
    const countriesOut: CountryTrade[] = resolved.map((item) => {
      const rows =
        byOfficial.get(canonicalCountry(item.name)) ??
        byOfficial.get(canonicalCountry(item.asked)) ??
        byOfficial.get(foldCountry(item.name)) ??
        []
      const years = aggregateMonths(
        rows.map((row) => ({
          year: row.year ?? "",
          monthNumber: row.monthNumber,
          metricFOB: row.metricFOB,
          metricKG: row.metricKG,
        }))
      )
      const filled = period.years.map(
        (year) => years.find((row) => row.year === year) ?? { year, usdFob: 0, kg: 0, months: 0 }
      )
      return { country: item.asked, years: filled }
    })
    return {
      hsCode: parsed.digits,
      hsFilter: parsed.filter,
      hsLabel: String(label),
      periodFrom: period.from,
      periodTo: period.to,
      source: SOURCE,
      countries: [...countriesOut, ...missing],
      fetchedAt,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      hsCode: parsed.digits,
      hsFilter: parsed.filter,
      hsLabel: "",
      periodFrom: period.from,
      periodTo: period.to,
      source: SOURCE,
      countries: [
        ...resolved.map((item) => ({
          country: item.asked,
          years: emptyYears(period),
          error: message,
        })),
        ...missing,
      ],
      error: message,
      fetchedAt,
    }
  }
}

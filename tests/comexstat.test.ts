import assert from "node:assert/strict"
import test from "node:test"
import {
  aggregateMonths,
  parseHsCode,
  resolveCountry,
  tradeForCountry,
  tradePeriod,
  yearLabel,
} from "../lib/comexstat-map"
import type { TradeSnapshot } from "../lib/types"

test("HS 3305 is a heading and NCM is eight digits", () => {
  assert.deepEqual(parseHsCode("3305"), { digits: "3305", filter: "heading" })
  assert.deepEqual(parseHsCode("33.05"), { digits: "3305", filter: "heading" })
  assert.deepEqual(parseHsCode("33"), { digits: "33", filter: "chapter" })
  assert.deepEqual(parseHsCode("330510"), { digits: "330510", filter: "subHeading" })
  assert.deepEqual(parseHsCode("33051000"), { digits: "33051000", filter: "ncm" })
  assert.match((parseHsCode("330") as { error: string }).error, /2, 4, 6, or 8/)
})

test("misspelled Dominican Republic still maps to Comex Stat", () => {
  const row = resolveCountry("Republica Domincana")
  assert.equal(row?.id, "647")
  assert.equal(resolveCountry("Chile")?.id, "158")
  assert.equal(resolveCountry("África do Sul")?.id, "756")
  assert.equal(resolveCountry("Marrocos")?.id, "474")
  assert.equal(resolveCountry("Bolívia")?.id, "097")
})

test("monthly Comex Stat rows fold into three years", () => {
  const years = aggregateMonths([
    { year: "2024", monthNumber: "01", metricFOB: "100", metricKG: "10" },
    { year: "2024", monthNumber: "02", metricFOB: "50", metricKG: "5" },
    { year: "2025", monthNumber: "01", metricFOB: "20", metricKG: "2" },
  ])
  assert.equal(years[0]?.usdFob, 150)
  assert.equal(years[0]?.months, 2)
  assert.equal(years[1]?.kg, 2)
})

test("the last three years include the current calendar year", () => {
  const period = tradePeriod(new Date("2026-10-30T18:00:00.000Z"))
  assert.equal(period.from, "2024-01")
  assert.equal(period.to, "2026-10")
  assert.deepEqual(period.years, [2024, 2025, 2026])
  assert.equal(yearLabel({ year: 2026, usdFob: 1, kg: 1, months: 9 }, "2026-09"), "2026 (jan–09)")
  assert.equal(yearLabel({ year: 2025, usdFob: 1, kg: 1, months: 12 }, "2026-09"), "2025")
})

test("a lead country finds its Comex Stat series", () => {
  const snapshot = {
    hsCode: "3305",
    hsFilter: "heading",
    hsLabel: "Preparations for use on the hair",
    periodFrom: "2024-01",
    periodTo: "2026-09",
    source: "Comex Stat",
    countries: [
      {
        country: "Dominican Republic",
        years: [{ year: 2024, usdFob: 1, kg: 1, months: 12 }],
      },
    ],
    fetchedAt: "2026-10-30T18:00:00.000Z",
  } satisfies TradeSnapshot
  assert.equal(tradeForCountry(snapshot, "Republica Domincana")?.years[0]?.usdFob, 1)
})

import assert from "node:assert/strict"
import test from "node:test"
import { classifyActivity, ACTIVITY_MONTHS } from "../lib/activity"
import { KANECHOM_BRIEF } from "../lib/example"
import { leadsDueForRefresh } from "../lib/lead-refresh"
import { listLeadRecordsFromRuns } from "../lib/lead-db"
import { computeResponseProbability, mixOverlap } from "../lib/response-probability"
import { sampleRun } from "../lib/sample"
import type { Lead, Run, TradeFilingMatch, TradeSnapshot } from "../lib/types"

function lead(partial: Partial<Lead> = {}): Lead {
  return {
    id: "lead-premium",
    name: "Premium Cosmetics S.A.",
    domain: "premium.example",
    url: "https://premium.example",
    country: "Panama",
    market: "Panama",
    exa: {
      title: "Premium Cosmetics",
      url: "https://premium.example",
      domain: "premium.example",
      text: "Distribuidor panameño de cosméticos.",
      highlights: [],
      summary: "Distributor brochure.",
    },
    ...partial,
  }
}

function filing(quality: TradeFilingMatch["quality"]): TradeFilingMatch {
  return {
    recordId: "f1",
    importer: "Premium Cosmetics S.A.",
    hs: "3305",
    hsShipments: 4,
    cargo: "shampoo",
    quality,
    occupiedBrands: [],
    occupiedShare: 0,
    partners: [],
    description: "shampoo",
    latestMonths: ["2025-08"],
    hsCodes: [{ code: "3305", shipments: 4 }],
    tradingCountries: ["Brazil"],
    ports: [],
    originsRedacted: true,
    portsRedacted: true,
    partnersRedacted: true,
    headingOnly: true,
    brazilHint: true,
    logisticsShare: 0,
    note: "Dump indication only.",
  }
}

function trade(): TradeSnapshot {
  return {
    hsCode: "3305",
    hsFilter: "heading",
    hsLabel: "3305",
    periodFrom: "2024-01",
    periodTo: "2026-10",
    source: "comexstat",
    countries: [
      { country: "Panama", years: [{ year: 2025, usdFob: 2_400_000, kg: 90_000, months: 12 }] },
    ],
    fetchedAt: "2026-10-30T00:00:00.000Z",
  }
}

function runOf(item: Lead, extra: Partial<Run> = {}): Run {
  return {
    ...sampleRun(),
    brief: KANECHOM_BRIEF,
    competitors: extra.competitors ?? [],
    trade: extra.trade,
    leads: [item],
    ...extra,
  }
}

test("activity window is 24 months", () => {
  assert.equal(ACTIVITY_MONTHS, 24)
})

test("Instagram follower growth and a mix change are distinct signals", () => {
  assert.equal(
    classifyActivity(
      "https://www.instagram.com/premium",
      "Premium Cosmetics",
      "120 mil seguidores. Crescimento no Instagram em 2026."
    ),
    "social_growth"
  )
  assert.equal(
    classifyActivity(
      "https://premium.example/brands",
      "Premium dropped the brand X",
      "The distributor dropped the brand and changed the product mix."
    ),
    "mix_change"
  )
})

test("listing old leads fills a missing response instead of leaving it at zero", () => {
  const item = lead({
    id: "old-1",
    openai: {
      icp: "high",
      supplierFits: [{ supplier: "Kanechom", level: "high" }],
      bestFit: "Kanechom",
      qualificationNeeded: "Confirm a first order.",
      rationale: "Looks like a distributor.",
    },
  })
  const run = runOf(item, { trade: trade() })
  run.mode = "live"
  run.id = "live-old"
  const rows = listLeadRecordsFromRuns([run])
  assert.equal(rows.length, 1)
  assert.ok((rows[0].responseScore ?? 0) > 0)
  assert.notEqual(rows[0].responseLevel, undefined)
  assert.match(rows[0].responseNote || "", /sem fato publicado de compra/i)
})

test("confirmed dump shipments are a strong signal and still not a Kanechom purchase", () => {
  const item = lead({
    seed: "dump",
    apiConfirm: {
      exa: "confirmed",
      firecrawl: "confirmed",
      note: "Exa e Firecrawl confirmaram.",
    },
    filing: {
      ...filing("usable"),
      hsShipments: 12,
      lastTradeDate: "2026-06-30",
      latestMonths: ["202606"],
    },
    openai: {
      icp: "high",
      supplierFits: [{ supplier: "Kanechom", level: "high" }],
      bestFit: "Kanechom",
      qualificationNeeded: "Confirm a first order.",
      rationale: "Looks like a distributor.",
    },
  })
  const result = computeResponseProbability(runOf(item, { trade: trade() }), item)
  assert.ok(result.score >= 38, `expected a strong medium, got ${result.score}`)
  assert.notEqual(result.level, "high")
  assert.ok(result.score <= 61)
  assert.match(result.note, /embarques de aduana confirmados/i)
  assert.match(result.note, /não é compra Kanechom/i)
})

test("a dump filing never makes response probability high", () => {
  const item = lead({
    filing: filing("usable"),
    filingChecked: true,
    openai: {
      icp: "high",
      supplierFits: [{ supplier: "Kanechom", level: "high" }],
      bestFit: "Kanechom",
      qualificationNeeded: "Confirm a first order.",
      rationale: "Looks like a distributor.",
    },
  })
  const result = computeResponseProbability(runOf(item, { trade: trade() }), item)
  assert.notEqual(result.level, "high")
  assert.ok(result.score <= 54)
  assert.match(result.note, /dump|Aduana|indicação/i)
})

test("purchasing hire, mix overlap, and Comex volume lift a published restock", () => {
  const item = lead({
    extraction: {
      ok: true,
      companyName: "Premium Cosmetics S.A.",
      headquarters: "Panama City",
      country: "Panama",
      role: "distributor",
      buys: ["shampoo", "conditioner"],
      sells: ["shampoo", "conditioner", "treatments"],
      markets: ["Panama"],
      certifications: [],
      buyerSignals: [],
      summary: "Retail hair care shampoo and conditioner.",
      excerpt: "In stock. Restocked keratin shampoo this month.",
      stock: "in stock, acaba de chegar",
    },
    openai: {
      icp: "high",
      supplierFits: [{ supplier: "Kanechom", level: "high" }],
      bestFit: "Kanechom",
      qualificationNeeded: "Ask for the buyer.",
      rationale: "Hair distributor.",
    },
    commerce: {
      fetchedAt: "2026-10-30T00:00:00.000Z",
      signals: [
        {
          kind: "restock",
          title: "Acaba de llegar shampoo",
          url: "https://premium.example/stock",
          quote: "Acaba de chegar estoque de shampoo.",
        },
        {
          kind: "hiring_buy",
          title: "Gerente de compras",
          url: "https://jobs.example/premium-compras",
          quote: "Vacante de gerente de compras internacional.",
        },
      ],
    },
    activity: {
      fetchedAt: "2026-10-30T00:00:00.000Z",
      signals: [
        {
          kind: "mix_change",
          title: "Nova linha no mix",
          url: "https://news.example/premium-mix",
          quote: "Mudou o mix de produtos e added a new line.",
        },
        {
          kind: "social_growth",
          title: "Instagram",
          url: "https://www.instagram.com/premium",
          quote: "Crescimento de seguidores.",
        },
      ],
    },
  })
  assert.ok(mixOverlap(KANECHOM_BRIEF.products, item) >= 0.12)
  const result = computeResponseProbability(
    runOf(item, {
      trade: trade(),
      competitors: [{ name: "Rival Hair", country: "Panama", whyRelevant: "salon hair", url: "https://rival.example" }],
    }),
    item
  )
  assert.equal(result.hiring, true)
  assert.equal(result.mixChange, true)
  assert.equal(result.socialGrowth, true)
  assert.ok(result.score >= 38)
  assert.match(result.note, /vaga de compras/)
})

test("fresh signals skip the weekly refresh; stale rows are due", () => {
  const fresh = lead({ id: "fresh", signalsAt: new Date().toISOString() })
  const stale = lead({ id: "stale", signalsAt: "2026-01-01T00:00:00.000Z" })
  const missing = lead({ id: "missing" })
  const runs: Run[] = [
    runOf(fresh, { id: "run-a", mode: "live", leads: [fresh, stale] }),
    { ...sampleRun(), id: "run-sample", mode: "sample", leads: [missing] },
    runOf(missing, { id: "run-b", mode: "live", leads: [missing] }),
  ]
  const due = leadsDueForRefresh(runs, Date.parse("2026-11-03T00:00:00.000Z"))
  assert.deepEqual(
    due.map((row) => row.leadId).sort(),
    ["missing", "stale"]
  )
})

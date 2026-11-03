import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { KANECHOM_BRIEF, validateBrief } from "../lib/example"
import { createRun } from "../lib/pipeline"
import {
  candidatesForBrief,
  dumpConfirmQuery,
  dumpSimilarQuery,
  firecrawlConfirms,
  pickExaConfirmation,
  similarHitAllowed,
} from "../lib/confirm"
import { hasCommercialBuyFacts } from "../lib/commerce"
import { hasPublishedBuyFacts } from "../lib/fit-probability"
import { qualificationRows } from "../lib/qualify"
import { applyFilingToLead, parseTradeDump } from "../lib/trade-records"
import type { Extraction, Lead } from "../lib/types"

const dump = fs.readFileSync(path.join(process.cwd(), "lib/data/panama-shampoo.txt"), "utf8")

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    ok: true,
    companyName: "Agencia y Mercadeo",
    headquarters: "Panama City",
    country: "Panama",
    role: "importer",
    buys: ["shampoo"],
    sells: ["retail hair care"],
    markets: ["Panama"],
    certifications: [],
    buyerSignals: ["We import hair care for supermarkets."],
    summary: "Panama importer of hair care.",
    excerpt: "We import hair care.",
    ...overrides,
  }
}

function leadFromDump(): Lead {
  const rows = parseTradeDump(dump)
  const filing = rows.find((row) => /mercadeo/i.test(row.importer))
  assert.ok(filing)
  const lead: Lead = {
    id: "agencia",
    name: filing.importer,
    domain: "agencia.com.pa",
    url: "https://agencia.com.pa",
    country: "Panama",
    market: "Panama",
    seed: "dump",
    apiConfirm: {
      exa: "confirmed",
      firecrawl: "confirmed",
      note: "Exa e Firecrawl confirmaram a empresa.",
    },
    exa: {
      title: filing.importer,
      url: "https://agencia.com.pa",
      domain: "agencia.com.pa",
      text: "Hair care importer in Panama.",
      highlights: [],
      summary: "Exa confirmed the company.",
    },
    extraction: extraction(),
  }
  return applyFilingToLead(lead, rows, { ...KANECHOM_BRIEF, markets: "Panama", hsCode: "3305" })
}

test("dump candidates exclude logistics and global brands and stay in the brief country", () => {
  const rows = parseTradeDump(dump)
  const panama = candidatesForBrief(rows, { ...KANECHOM_BRIEF, markets: "Panama", hsCode: "3305" })
  assert.ok(panama.some((row) => /mercadeo/i.test(row.importer)))
  assert.equal(panama.some((row) => /unilever/i.test(row.importer)), false)
  assert.equal(panama.some((row) => /avon/i.test(row.importer)), false)
  const chile = candidatesForBrief(rows, { ...KANECHOM_BRIEF, markets: "Chile", hsCode: "3305" })
  assert.equal(chile.length, 0)
})

test("Exa must confirm the dump name on a company site", () => {
  const rows = parseTradeDump(dump)
  const filing = rows.find((row) => /mercadeo/i.test(row.importer))
  assert.ok(filing)
  const missed = pickExaConfirmation(filing, [])
  assert.equal(missed.status, "rejected")
  const social = pickExaConfirmation(filing, [
    {
      title: "Agencia y Mercadeo",
      url: "https://linkedin.com/company/agencia",
      text: "Hair care importer",
    },
  ])
  assert.equal(social.status, "rejected")
  const otherName = pickExaConfirmation(filing, [
    {
      title: "Random Logistics Inc",
      url: "https://randomlogistics.com",
      text: "Freight forwarder in Panama",
    },
  ])
  assert.equal(otherName.status, "rejected")
  const hit = pickExaConfirmation(filing, [
    {
      title: "Agencia y Mercadeo S.A.",
      url: "https://agencia.com.pa",
      text: "Importer and distributor of hair care and cosmetics in Panama.",
    },
  ])
  assert.equal(hit.status, "confirmed")
  assert.equal(hit.hit?.url, "https://agencia.com.pa")
})

test("Firecrawl confirms only a hair importer page", () => {
  const ok = firecrawlConfirms(extraction())
  assert.equal(ok.status, "confirmed")
  const salon = firecrawlConfirms(
    extraction({
      role: "beauty salon",
      buys: [],
      sells: ["cuts"],
      buyerSignals: [],
      summary: "Walk-in salon in Panama City.",
    })
  )
  assert.equal(salon.status, "rejected")
  const unread = firecrawlConfirms(extraction({ ok: false, error: "timeout", summary: "" }))
  assert.equal(unread.status, "skipped")
})

test("similar-importer search drops logistics and global brands", () => {
  assert.equal(similarHitAllowed("UNILEVER DE CENTROAMERICA S.A.", ["Agencia"]), false)
  assert.equal(similarHitAllowed("O&M LOGISTIC SERVICE", ["Agencia"]), false)
  assert.equal(similarHitAllowed("Importadora Dany S.A.", ["Agencia y Mercadeo"]), true)
  const query = dumpSimilarQuery(["Agencia y Mercadeo"], "Panama", KANECHOM_BRIEF)
  assert.match(query, /similar to/)
  assert.match(query, /Unilever/)
  assert.match(dumpConfirmQuery("Agencia y Mercadeo", "Panama", "shampoo"), /Official company website/)
})

test("even after the APIs confirm the company, the dump still does not confirm a purchase", () => {
  const lead = leadFromDump()
  assert.equal(lead.apiConfirm?.exa, "confirmed")
  assert.equal(lead.apiConfirm?.firecrawl, "confirmed")
  assert.ok(lead.filing)
  assert.equal(hasCommercialBuyFacts(lead), false)
  assert.equal(hasPublishedBuyFacts(lead), false)
  const [row] = qualificationRows([lead], { ...KANECHOM_BRIEF, markets: "Panama" })
  assert.equal(row.bestFit, "neither")
  assert.match(row.qualificationNeeded, /confirmaram|indicação|falsos/i)
})

test("Dump + API is a first-class search kind and keeps the four pipeline stages", () => {
  const parsed = validateBrief({
    ...KANECHOM_BRIEF,
    searchKind: "dump",
    markets: "Panama",
    products: "shampoo",
    buyerTypes: "importer",
  })
  assert.equal(parsed.brief?.searchKind, "dump")
  const run = createRun(parsed.brief!)
  assert.equal(run.stages[0].id, "search")
  assert.equal(run.stages.length, 5)
  assert.match(run.stages[0].detail, /Dump names go to Exa/i)
  assert.match(run.logs[0].message, /dump never confirms/i)
})

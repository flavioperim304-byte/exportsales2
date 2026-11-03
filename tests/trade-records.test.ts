import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { KANECHOM_BRIEF } from "../lib/example"
import { classifyBlocks } from "../lib/diligence"
import { computeFitProbability, hasPublishedBuyFacts } from "../lib/fit-probability"
import { hasCommercialBuyFacts } from "../lib/commerce"
import { qualificationRows } from "../lib/qualify"
import {
  applyFilingToLead,
  isGlobalBrandImporter,
  isSearchCandidate,
  parseTradeDump,
} from "../lib/trade-records"
import type { Lead } from "../lib/types"

const dump = fs.readFileSync(path.join(process.cwd(), "lib/data/panama-shampoo.txt"), "utf8")

function quietLead(name = "Agencia y Mercadeo S.A."): Lead {
  return {
    id: "agencia",
    name,
    domain: "agencia.example",
    url: "https://agencia.example",
    country: "Panama",
    market: "Panama",
    exa: {
      title: name,
      url: "https://agencia.example",
      domain: "agencia.example",
      text: "Distribuidor panameño de cosméticos.",
      highlights: [],
      summary: "Distributor brochure.",
    },
    extraction: {
      ok: true,
      companyName: name,
      headquarters: "Panama City",
      country: "Panama",
      role: "distributor",
      buys: ["hair care"],
      sells: [],
      markets: ["Panama"],
      certifications: [],
      buyerSignals: [],
      summary: "Brochure.",
      excerpt: "We import hair care.",
    },
    activity: { fetchedAt: "2026-11-02T00:00:00.000Z", signals: [] },
    openai: {
      icp: "high",
      supplierFits: [{ supplier: "Kanechom", level: "high" }],
      bestFit: "Kanechom",
      qualificationNeeded: "Send a price list.",
      rationale: "Looks like a distributor.",
    },
  }
}

test("the August Panama dump parses named importers and is not a full census", () => {
  const rows = parseTradeDump(dump)
  assert.ok(rows.length >= 25 && rows.length <= 40)
  const agencia = rows.find((row) => /mercadeo/i.test(row.importer))
  assert.ok(agencia)
  assert.equal(agencia?.hs, "330510")
  assert.equal(agencia?.hsShipments, 336)
  assert.ok(agencia?.occupiedBrands.some((brand) => /l'?or[eé]al/i.test(brand) || brand.includes("L'Oréal")))
  assert.ok(rows.some((row) => /816 companies in total/i.test(dump)))
})

test("logistics names and global brand subsidiaries are not search candidates", () => {
  const rows = parseTradeDump(dump)
  assert.equal(isGlobalBrandImporter("UNILEVER DE CENTROAMERICA S.A."), true)
  assert.equal(isGlobalBrandImporter("PRODUCTOS AVON S.A."), true)
  assert.equal(isGlobalBrandImporter("PRICESMART PANAMA S.A."), true)
  assert.equal(isGlobalBrandImporter("AGENCIA Y. MERCADEO S.A."), false)
  const unilever = rows.find((row) => /unilever/i.test(row.importer))
  const amazon = rows.find((row) => /ramona/i.test(row.importer))
  const agencia = rows.find((row) => /mercadeo/i.test(row.importer))
  const dany = rows.find((row) => /dany/i.test(row.importer))
  assert.equal(unilever ? isSearchCandidate(unilever) : false, false)
  assert.equal(amazon ? isSearchCandidate(amazon) : false, false)
  assert.equal(agencia ? isSearchCandidate(agencia) : false, true)
  assert.equal(dany ? isSearchCandidate(dany) : false, true)
})

test("the Company Data list card is not a bill of lading and keeps *** unpublished", () => {
  const text = fs.readFileSync(path.join(process.cwd(), "lib/data/tradeindata-list.txt"), "utf8")
  const rows = parseTradeDump(text, "tradeindata", "UAE.txt")
  assert.equal(rows.length, 2)
  const ikea = rows.find((row) => /ikea/i.test(row.importer))
  const dole = rows.find((row) => /dole/i.test(row.importer))
  assert.ok(ikea)
  assert.ok(dole)
  assert.equal(ikea?.country, "United States")
  assert.equal(ikea?.lastTradeDate, "2026-09-29")
  assert.equal(ikea?.hs, "630492")
  assert.equal(ikea?.hsShipments, 114230)
  assert.equal(ikea?.totalShipments, 1023065)
  assert.deepEqual(
    ikea?.hsCodes.map((row) => row.code),
    ["630492", "930119"]
  )
  assert.equal(ikea?.cargo, "noise")
  assert.equal(isSearchCandidate(ikea!), false)
  assert.equal(ikea?.originsRedacted, true)
  assert.equal(ikea?.portsRedacted, true)
  assert.ok(ikea?.tradingCountries.includes("Romania"))
  assert.ok(ikea?.ports.includes("FREEPORT"))
  assert.equal(
    ikea?.partners.some((partner) => partner.name.includes("*") || partner.name === "Romania"),
    false
  )
  assert.equal(ikea?.sourceFile, "UAE.txt")
  assert.equal(dole?.hs, "080390")
  assert.equal(dole?.cargo, "other")
  assert.match(dole?.description ?? "", /bananas/i)
  assert.ok(dole?.latestMonths.includes("202605"))
})

test("a TradeInData dump does not confirm purchase or unlock best fit", () => {
  const rows = parseTradeDump(dump)
  const lead = applyFilingToLead(quietLead(), rows, KANECHOM_BRIEF)
  assert.ok(lead.filing)
  assert.equal(hasCommercialBuyFacts(lead), false)
  assert.equal(hasPublishedBuyFacts(lead), false)
  const fit = computeFitProbability(KANECHOM_BRIEF, lead)
  assert.equal(fit.facts.find((fact) => fact.kind === "last_purchase")?.found, false)
  const [row] = qualificationRows([lead], KANECHOM_BRIEF)
  assert.equal(row.bestFit, "neither")
  assert.match(row.qualificationNeeded, /indicação|falsos/i)
  const states = classifyBlocks("lq", lead)
  assert.notEqual(states.import, "strong")
  assert.equal(states.import, "partial")
})

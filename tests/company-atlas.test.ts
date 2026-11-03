import assert from "node:assert/strict"
import test from "node:test"
import { decodeAtlasOAuthCookie, encodeAtlasOAuthCookie } from "../lib/atlas-client"
import { hasCommercialBuyFacts } from "../lib/commerce"
import {
  applyAtlasToLead,
  ATLAS_MARKETS,
  ATLAS_TOOLS,
  atlasCoverage,
  atlasHsPrefix,
  atlasLookupKey,
  atlasMarketFor,
  atlasRejectedReason,
  enrichDumpWithAtlas,
  extraAtlasNames,
  matchAtlasName,
  parseAtlasPartners,
  parseAtlasRank,
  planAtlasLookups,
} from "../lib/company-atlas"
import { hasPublishedBuyFacts } from "../lib/fit-probability"
import { KANECHOM_BRIEF } from "../lib/example"
import { qualificationRows } from "../lib/qualify"
import type { Lead, TradeFiling } from "../lib/types"

function filing(importer: string, country: string, extras: Partial<TradeFiling> = {}): TradeFiling {
  return {
    id: `${importer}-${country}`,
    importer,
    country,
    description: "shampoo",
    hs: "3305",
    hsShipments: 10,
    totalShipments: 10,
    partners: [],
    latestMonths: [],
    hsCodes: [{ code: "3305", shipments: 10 }],
    tradingCountries: [],
    ports: [],
    originsRedacted: true,
    portsRedacted: true,
    partnersRedacted: true,
    headingOnly: false,
    cargo: "shampoo",
    occupiedBrands: [],
    occupiedShare: 0,
    logisticsShare: 0,
    brazilHint: false,
    quality: "usable",
    source: "tradeindata",
    ...extras,
  }
}

function leadFrom(filing: TradeFiling): Lead {
  return {
    id: filing.id,
    name: filing.importer,
    domain: "andes.cl",
    url: "https://andes.cl",
    country: filing.country,
    market: filing.country,
    seed: "dump",
    apiConfirm: {
      exa: "confirmed",
      firecrawl: "confirmed",
      note: "Exa e Firecrawl confirmaram a empresa.",
    },
    exa: {
      title: filing.importer,
      url: "https://andes.cl",
      domain: "andes.cl",
      text: "Hair care importer",
      highlights: [],
      summary: "Exa confirmed the company.",
    },
    extraction: {
      ok: true,
      companyName: filing.importer,
      headquarters: filing.country,
      country: filing.country,
      role: "importer",
      buys: ["shampoo"],
      sells: [],
      markets: [filing.country],
      certifications: [],
      buyerSignals: ["We import hair care."],
      summary: "Importer of hair care.",
      excerpt: "We import hair care.",
    },
    filing: {
      recordId: filing.id,
      importer: filing.importer,
      hs: filing.hs,
      hsShipments: filing.hsShipments,
      cargo: filing.cargo,
      quality: filing.quality,
      occupiedBrands: [],
      occupiedShare: 0,
      partners: [],
      description: filing.description,
      latestMonths: [],
      hsCodes: filing.hsCodes,
      tradingCountries: [],
      ports: [],
      originsRedacted: true,
      portsRedacted: true,
      partnersRedacted: true,
      headingOnly: false,
      brazilHint: false,
      logisticsShare: 0,
      note: "indicação",
    },
  }
}

test("the live free plan lists 36 customs markets including limited Panama", () => {
  assert.equal(ATLAS_MARKETS.length, 36)
  assert.equal(atlasMarketFor("Chile")?.iso, "CL")
  assert.equal(atlasMarketFor("Côte d'Ivoire")?.iso, "CI")
  assert.equal(atlasMarketFor("Ivory Coast")?.iso, "CI")
  assert.equal(atlasMarketFor("Panama")?.limited, true)
  assert.equal(atlasMarketFor("South Sudan")?.iso, "SS")
  assert.equal(atlasMarketFor("Sudan"), undefined)
  assert.equal(atlasMarketFor("Germany"), undefined)
  assert.equal(atlasMarketFor("United Arab Emirates"), undefined)
  assert.equal(atlasMarketFor("Japan"), undefined)
})

test("dump coverage splits Atlas overlap from countries the trial does not have", () => {
  const coverage = atlasCoverage(
    [
      { country: "Chile", candidates: 18 },
      { country: "Panama", candidates: 40 },
      { country: "Germany", candidates: 12 },
      { country: "Sudan", candidates: 8 },
      { country: "UAE", candidates: 69 },
    ],
    false
  )
  assert.equal(coverage.overlapping.map((row) => row.country).join(","), "Panama,Chile")
  assert.ok(coverage.outside.some((row) => row.country === "Germany"))
  assert.ok(coverage.outside.some((row) => row.country === "Sudan"))
  assert.match(coverage.note, /não compra Kanechom/i)
})

test("a dump run budgets one rank per overlapping country and keeps credits for the occupied book", () => {
  const plan = planAtlasLookups(
    [
      filing("Andes", "Chile"),
      filing("Mercadeo", "Panama"),
      filing("Indofood", "Indonesia"),
      filing("Karachi Hair", "Pakistan"),
      filing("Nairobi Beauty", "Kenya"),
      filing("Bogota Capilar", "Colombia"),
      filing("Berlin GmbH", "Germany"),
    ],
    { ...KANECHOM_BRIEF, hsCode: "3305" }
  )
  assert.equal(plan.ranks.length, 4)
  assert.equal(plan.ranks.some((row) => row.country === "Germany"), false)
  assert.equal(plan.hs, "3305")
  assert.equal(atlasHsPrefix({ hsCode: "330510" }), "330510")
  assert.ok(plan.partnerSlots >= 4)
})

test("rank payloads and partner rolls parse without a live login", () => {
  const ranked = parseAtlasRank({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          companies: [
            { company_id: "cl-1", name: "Importadora Andes SpA", line_count: 9, years: [2024, 2025] },
            { company_id: "cl-2", name: "Unilever Chile", line_count: 80, years: [2024] },
          ],
        }),
      },
    ],
  })
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].name, "Importadora Andes SpA")
  const hit = matchAtlasName("IMPORTADORA ANDES S.P.A.", ranked)
  assert.equal(hit?.companyId, "cl-1")
  const partners = parseAtlasPartners({
    suppliers: [{ name: "Fabrica Capilar Ltda", company_id: "f1" }],
    customers: [{ name: "Retail SA" }],
  })
  assert.equal(partners[0].direction, "supplier")
  assert.equal(partners[1].direction, "customer")
})

test("Atlas enriches overlapping dump names and leaves Germany to Exa", async () => {
  const filings = [
    filing("Importadora Andes SpA", "Chile"),
    filing("Agencia y Mercadeo S.A.", "Panama"),
    filing("Berlin Hair GmbH", "Germany"),
  ]
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const lookup = await enrichDumpWithAtlas(filings, { ...KANECHOM_BRIEF, hsCode: "3305" }, {
    connected: true,
    client: {
      async call(name, args) {
        calls.push({ name, args })
        if (name === ATLAS_TOOLS.rank && args.buyer_country === "CL") {
          return {
            companies: [
              { company_id: "cl-1", name: "Importadora Andes SpA", line_count: 9, years: [2024] },
              { company_id: "cl-9", name: "Distribuidora Capilar Sur", line_count: 4, years: [2025] },
            ],
          }
        }
        if (name === ATLAS_TOOLS.rank) return { companies: [] }
        if (name === ATLAS_TOOLS.search && args.buyer_country === "PA") {
          return {
            rows: [{ buyer: "Agencia y Mercadeo S.A.", buyer_id: "", hs_code: "330510", date: "2025-03-01" }],
          }
        }
        if (name === ATLAS_TOOLS.partners) {
          return { suppliers: [{ name: "Fabrica Capilar Ltda" }, { name: "L'Oreal Chile" }] }
        }
        return { companies: [], rows: [] }
      },
    },
  })
  const chile = lookup.matches.get(atlasLookupKey("Importadora Andes SpA", "Chile"))
  const panama = lookup.matches.get(atlasLookupKey("Agencia y Mercadeo S.A.", "Panama"))
  const germany = lookup.matches.get(atlasLookupKey("Berlin Hair GmbH", "Germany"))
  assert.equal(chile?.status, "hit")
  assert.equal(chile?.companyId, "cl-1")
  assert.ok(chile?.partners.some((row) => /Fabrica Capilar/i.test(row.name)))
  assert.equal(panama?.status, "hit")
  assert.equal(germany?.status, "no_market")
  assert.ok(extraAtlasNames(lookup, "Chile").some((name) => /Capilar Sur/i.test(name)))
  assert.ok(lookup.creditsUsed >= 2)
  assert.match(atlasRejectedReason(chile, "Exa não achou a empresa."), /provavelmente existe/)
})

test("an Atlas customs line does not unlock Fit or a published purchase", async () => {
  const row = filing("Importadora Andes SpA", "Chile")
  const lookup = await enrichDumpWithAtlas([row], { ...KANECHOM_BRIEF, hsCode: "3305", markets: "Chile" }, {
    connected: true,
    client: {
      async call(name) {
        if (name === ATLAS_TOOLS.rank) {
          return { companies: [{ company_id: "cl-1", name: "Importadora Andes SpA", line_count: 9, years: [2024] }] }
        }
        if (name === ATLAS_TOOLS.partners) {
          return { suppliers: [{ name: "Fabrica Capilar Ltda" }] }
        }
        return {}
      },
    },
  })
  const lead = applyAtlasToLead(leadFrom(row), lookup)
  assert.equal(lead.atlas?.status, "hit")
  assert.equal(lead.filing?.partnersRedacted, false)
  assert.ok(lead.filing?.partners.some((partner) => /Fabrica Capilar/i.test(partner.name)))
  assert.equal(hasCommercialBuyFacts(lead), false)
  assert.equal(hasPublishedBuyFacts(lead), false)
  const [qualified] = qualificationRows([lead], { ...KANECHOM_BRIEF, markets: "Chile" })
  assert.equal(qualified.bestFit, "neither")
  assert.match(qualified.qualificationNeeded, /indicação|não confirma compra/i)
})

test("without a Google session Atlas is skipped and still does not reject the dump name", async () => {
  const lookup = await enrichDumpWithAtlas(
    [filing("Importadora Andes SpA", "Chile")],
    { ...KANECHOM_BRIEF, hsCode: "3305" }
  )
  const match = lookup.matches.get(atlasLookupKey("Importadora Andes SpA", "Chile"))
  assert.equal(match?.status, "skipped")
  assert.equal(lookup.creditsUsed, 0)
  assert.match(lookup.note, /não conectado/i)
})

test("the OAuth cookie round-trips PKCE state for the Google callback", () => {
  const cookie = encodeAtlasOAuthCookie({
    verifier: "verifier-1",
    state: "state-1",
    clientId: "client-1",
    redirectUri: "http://127.0.0.1:3947/api/atlas/callback",
  })
  const pending = decodeAtlasOAuthCookie(cookie)
  assert.equal(pending?.verifier, "verifier-1")
  assert.equal(pending?.clientId, "client-1")
})

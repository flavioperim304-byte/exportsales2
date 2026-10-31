import assert from "node:assert/strict"
import test from "node:test"
import {
  SCORE_TABLE,
  approachPriority,
  brandKindOf,
  priorityNote,
  buildReport,
  classifyBlocks,
  coverageGaps,
  diffReports,
  latestReport,
  opportunityFromStates,
  pointsFor,
  probeFromSearch,
} from "../lib/diligence"
import { KANECHOM_BRIEF, LQ_BRIEF } from "../lib/example"
import { resultsCsv } from "../lib/csv"
import { sampleRun } from "../lib/sample"
import { createRun } from "../lib/pipeline"
import type { DiligenceEvidenceState, Lead } from "../lib/types"

function lead(partial: Partial<Lead> & Pick<Lead, "name">): Lead {
  return {
    id: partial.id ?? "lead-1",
    name: partial.name,
    domain: partial.domain ?? "example.com",
    url: partial.url ?? "https://example.com",
    country: partial.country ?? "Colombia",
    market: partial.market ?? "Colombia",
    exa: partial.exa ?? {
      title: partial.name,
      url: "https://example.com",
      domain: "example.com",
      text: partial.exa?.text ?? "",
      highlights: [],
      summary: partial.exa?.summary ?? "",
    },
    extraction: partial.extraction,
    activity: partial.activity,
    context: partial.context,
    diligence: partial.diligence,
  }
}

test("every evidence state has a fixed point value and the six blocks add to 100", () => {
  const states: DiligenceEvidenceState[] = [
    "strong",
    "partial",
    "stale",
    "absent",
    "inadequate",
    "contradictory",
    "negative",
  ]
  let max = 0
  for (const block of ["channel", "portfolio", "import", "geography", "activity", "opening"] as const) {
    max += SCORE_TABLE[block].strong
    for (const state of states) {
      assert.equal(typeof SCORE_TABLE[block][state], "number")
      assert.equal(pointsFor(block, state), SCORE_TABLE[block][state])
    }
  }
  assert.equal(max, 100)
  const allStrong = opportunityFromStates({
    channel: "strong",
    portfolio: "strong",
    import: "strong",
    geography: "strong",
    activity: "strong",
    opening: "strong",
  })
  assert.equal(allStrong.total, 100)
  const allAbsent = opportunityFromStates({
    channel: "absent",
    portfolio: "absent",
    import: "absent",
    geography: "absent",
    activity: "absent",
    opening: "absent",
  })
  assert.equal(allAbsent.total, 10 + 8 + 8 + 6 + 3 + 4)
})

test("Kanechom and LQ use the same numbers but opposite channel/portfolio states", () => {
  const mass = lead({
    name: "ImpoHogar",
    extraction: {
      ok: true,
      companyName: "ImpoHogar",
      headquarters: "Bogotá",
      country: "Colombia",
      role: "mass-market distributor",
      buys: ["Skala shampoo"],
      sells: ["grocery hair care"],
      markets: ["Colombia"],
      certifications: [],
      buyerSignals: ["We import retail hair care for supermarkets."],
      lastPurchase: "Imported a Skala shipment in September 2026.",
      stock: "Shampoo is in stock.",
      summary: "Grocery distributor of Skala.",
      excerpt: "Skala in grocery.",
    },
  })
  const k = classifyBlocks("kanechom", mass)
  const lq = classifyBlocks("lq", mass)
  assert.equal(k.channel, "strong")
  assert.equal(k.portfolio, "strong")
  assert.equal(lq.channel, "negative")
  assert.equal(lq.portfolio, "negative")
  assert.ok(opportunityFromStates(k).total > opportunityFromStates(lq).total)
})

test("salon professional is strong for LQ and a conflict for Kanechom", () => {
  const salon = lead({
    name: "Pro Hair Dist",
    extraction: {
      ok: true,
      companyName: "Pro Hair Dist",
      headquarters: "Santiago",
      country: "Chile",
      role: "professional distributor",
      buys: ["salon keratin"],
      sells: ["straightening systems to salons"],
      markets: ["Chile"],
      certifications: [],
      buyerSignals: ["We train hairdressers."],
      summary: "Professional salon wholesale and keratin straightening.",
      excerpt: "Salon only.",
    },
  })
  const k = classifyBlocks("kanechom", salon)
  const lq = classifyBlocks("lq", salon)
  assert.equal(lq.channel, "strong")
  assert.equal(lq.portfolio, "strong")
  assert.ok(k.channel === "negative" || k.portfolio === "negative" || k.channel === "partial")
  assert.ok(opportunityFromStates(lq).total > opportunityFromStates(k).total)
})

test("missing import evidence is not_found, not negative", () => {
  const quiet = lead({
    name: "Folheto",
    exa: {
      title: "Folheto",
      url: "https://folheto.example",
      domain: "folheto.example",
      text: "We distribute professional hair care.",
      highlights: [],
      summary: "Distributor brochure.",
    },
    extraction: {
      ok: true,
      companyName: "Folheto",
      headquarters: "Bogotá",
      country: "Colombia",
      role: "distributor",
      buys: ["hair care"],
      sells: [],
      markets: ["Colombia"],
      certifications: [],
      buyerSignals: [],
      summary: "Brochure.",
      excerpt: "Brochure.",
    },
    activity: { fetchedAt: "2026-10-30T00:00:00.000Z", signals: [] },
  })
  const report = buildReport({ brand: "Kanechom", lead: quiet, brief: KANECHOM_BRIEF })
  assert.equal(report.importCapacity, "not_found")
  assert.match(report.importNote, /não permite concluir que a empresa não importa/)
  assert.equal(report.blocks.find((item) => item.key === "import")?.state, "absent")
  assert.equal(report.blocks.find((item) => item.key === "import")?.points, 8)
})

test("pursue is approach priority and never follows low confidence", () => {
  assert.equal(approachPriority(80, "high"), "pursue")
  assert.equal(approachPriority(80, "low"), "investigate")
  assert.equal(approachPriority(50, "high"), "watch")
  const report = buildReport({
    brand: "Kanechom",
    lead: lead({ name: "Quiet Co", exa: { title: "x", url: "https://x.example", domain: "x.example", text: "", highlights: [], summary: "Brochure." } }),
    brief: KANECHOM_BRIEF,
  })
  assert.notEqual(report.priority, "pursue")
  assert.match(priorityNote("pursue"), /abordagem comercial/)
  assert.match(priorityNote("pursue"), /Não é confirmação/)
})

test("complementary gaps become probes and not_found is recorded", () => {
  const quiet = lead({
    name: "Folheto Cosméticos",
    market: "Colombia",
    extraction: {
      ok: true,
      companyName: "Folheto Cosméticos",
      headquarters: "Bogotá",
      country: "Colombia",
      role: "distributor",
      buys: ["hair care"],
      sells: [],
      markets: ["Colombia"],
      certifications: [],
      buyerSignals: [],
      summary: "Brochure.",
      excerpt: "Brochure.",
    },
  })
  const states = classifyBlocks("kanechom", quiet)
  const gaps = coverageGaps("kanechom", quiet, KANECHOM_BRIEF, states)
  assert.ok(gaps.some((item) => item.questionId === "import_path"))
  const probe = probeFromSearch(gaps[0], [])
  assert.equal(probe.result, "not_found")
  assert.match(probe.note, /não é evidência negativa/)
  const found = probeFromSearch(gaps[0], [
    { url: "https://news.example/import", title: "Folheto imports", publishedAt: "2026-09-01T00:00:00.000Z" },
  ])
  assert.equal(found.result, "found")
})

test("a second report stores a diff against the previous one for that brand", () => {
  const item = lead({
    name: "ImpoHogar",
    extraction: {
      ok: true,
      companyName: "ImpoHogar",
      headquarters: "Bogotá",
      country: "Colombia",
      role: "importer",
      buys: ["Skala"],
      sells: [],
      markets: ["Colombia"],
      certifications: [],
      buyerSignals: ["We import retail hair care."],
      lastPurchase: "Imported in 2026.",
      summary: "Importer.",
      excerpt: "Importer.",
    },
  })
  const first = buildReport({ brand: "Kanechom", lead: item, brief: KANECHOM_BRIEF, now: new Date("2026-09-01T00:00:00.000Z") })
  const second = buildReport({
    brand: "Kanechom",
    lead: item,
    brief: KANECHOM_BRIEF,
    previous: first,
    now: new Date("2026-10-30T00:00:00.000Z"),
    findings: [
      {
        kind: "fact",
        polarity: "supports",
        topic: "portfolio",
        text: "Added a second mass brand.",
        urls: ["https://news.example/brand"],
        evidenceAt: "2026-10-01T00:00:00.000Z",
      },
    ],
  })
  assert.ok(second.diff)
  assert.equal(second.diff?.previousInvestigatedAt, first.investigatedAt)
  const kanechom = latestReport([first, second], "Kanechom")
  assert.equal(kanechom?.investigatedAt, second.investigatedAt)
  const lq = buildReport({ brand: "LQ Professional", lead: item, brief: LQ_BRIEF })
  assert.equal(latestReport([first, second, lq], "LQ Professional")?.brand, "LQ Professional")
  assert.equal(diffReports(first, second).opportunity.after, second.opportunityScore)
})

test("the four-stage pipeline still starts with search and does not auto-run diligence", () => {
  const run = createRun(KANECHOM_BRIEF, LQ_BRIEF)
  assert.equal(run.stages[0].id, "search")
  assert.equal(run.stages.find((item) => item.id === "context")?.status, "pending")
  assert.equal(run.stages.find((item) => item.id === "diligence")?.status, "pending")
  assert.equal(run.status, "searching")
})

test("OpenAI does not supply the opportunity score", () => {
  const item = lead({
    name: "ImpoHogar",
    extraction: {
      ok: true,
      companyName: "ImpoHogar",
      headquarters: "Bogotá",
      country: "Colombia",
      role: "mass-market importer",
      buys: ["Skala shampoo"],
      sells: ["grocery"],
      markets: ["Colombia"],
      certifications: [],
      buyerSignals: ["We import retail hair care for supermarkets."],
      lastPurchase: "Imported a keratin shipment in September 2026.",
      summary: "Mass retail importer of Skala.",
      excerpt: "Skala.",
    },
  })
  const local = buildReport({ brand: "Kanechom", lead: item, brief: KANECHOM_BRIEF })
  const withModelNoise = buildReport({
    brand: "Kanechom",
    lead: item,
    brief: KANECHOM_BRIEF,
    narratives: { opportunity: "This company would definitely buy. Score 99." },
  })
  assert.equal(local.opportunityScore, withModelNoise.opportunityScore)
})

test("CSV keeps the old columns and adds due-diligence fields", () => {
  const run = sampleRun()
  const csv = resultsCsv(run)
  assert.match(csv, /Company,Country,Role,ICP,Best fit,Activity,Fit probability,Fit evidence,Email/)
  assert.match(csv, /DD Kanechom opportunity/)
  assert.match(csv, /DD LQ priority/)
})

test("brand names map to the Kanechom and LQ scorebooks", () => {
  assert.equal(brandKindOf("Kanechom"), "kanechom")
  assert.equal(brandKindOf("LQ Professional"), "lq")
  assert.equal(brandKindOf("Serra Alta Exportadora"), "generic")
})

test("the coffee sample still ranks and can carry a diligence report", () => {
  const nord = sampleRun().leads.find((item) => item.id === "lead-nordlicht")
  assert.ok(nord)
  assert.equal(nord.score?.band, "best_fit")
  assert.ok(nord.diligence?.length)
  assert.equal(nord.diligence?.[0].brand, "Serra Alta Exportadora")
})

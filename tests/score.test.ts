import assert from "node:assert/strict"
import test from "node:test"
import { EXAMPLE_BRIEF } from "../lib/example"
import { sampleRun } from "../lib/sample"
import { scoreLead } from "../lib/score"
import type { Lead } from "../lib/types"

function explain(lead: Lead): string {
  const score = lead.score
  if (!score) return lead.name
  const parts = score.dimensions
    .map((item) => `${item.key}:${item.points}/${item.max}`)
    .join(" ")
  return `${lead.name} ${score.band} ${score.total} ${parts} ${score.disqualifyReason ?? ""}`
}

test("sample dossier ranks the coffee brief into the expected bands", () => {
  const run = sampleRun()
  const byId = new Map(run.leads.map((lead) => [lead.id, lead]))
  const nord = byId.get("lead-nordlicht")
  const haven = byId.get("lead-haven")
  const kumo = byId.get("lead-kumo")
  const atlas = byId.get("lead-atlas")
  const estate = byId.get("lead-estate")
  assert.ok(nord && haven && kumo && atlas && estate)

  assert.equal(nord.score?.band, "best_fit", explain(nord))
  assert.ok((nord.score?.total ?? 0) >= 80, explain(nord))

  assert.equal(haven.score?.band, "strong", explain(haven))
  assert.ok((haven.score?.total ?? 0) >= 64 && (haven.score?.total ?? 0) < 80, explain(haven))

  assert.equal(kumo.score?.band, "possible", explain(kumo))
  assert.ok((kumo.score?.total ?? 0) >= 46 && (kumo.score?.total ?? 0) < 64, explain(kumo))

  assert.equal(atlas.score?.band, "disqualified", explain(atlas))
  assert.match(atlas.score?.disqualifyReason ?? "", /instant coffee/i)

  assert.equal(estate.score?.band, "disqualified", explain(estate))
  assert.match(estate.score?.disqualifyReason ?? "", /Peer exporter/i)

  const ordered = run.leads.map((lead) => lead.id)
  assert.deepEqual(ordered.slice(0, 3), [
    "lead-nordlicht",
    "lead-haven",
    "lead-kumo",
  ])
  assert.equal(run.leads.at(-1)?.score?.disqualified, true)
})

test("the supplier’s own domain is disqualified", () => {
  const lead: Lead = {
    id: "self",
    name: "Serra Alta Exportadora",
    domain: "serraalta.example",
    url: "https://serraalta.example/about",
    country: "Brazil",
    exa: {
      title: "Serra Alta",
      url: "https://serraalta.example/about",
      domain: "serraalta.example",
      text: "We export green arabica microlots from Brazil. ".repeat(8),
      highlights: ["export green arabica"],
      summary: "Exporter of green arabica microlots from Minas Gerais, Brazil.",
    },
  }
  const score = scoreLead(EXAMPLE_BRIEF, lead)
  assert.equal(score.disqualified, true)
  assert.match(score.disqualifyReason ?? "", /own site/i)
})

test("“not exclusive” is an open book, not a locked account", () => {
  const lead: Lead = {
    id: "open",
    name: "Open Book Imports",
    domain: "open-book.example",
    url: "https://open-book.example/",
    country: "Germany",
    exa: {
      title: "Open Book Imports",
      url: "https://open-book.example/",
      domain: "open-book.example",
      text: "Importer of green arabica in Hamburg. ".repeat(8),
      highlights: ["imports green arabica"],
      summary: "German importer of green arabica for roasters.",
    },
    context: {
      fitNarrative: "The supply relationship is not exclusive.",
      knownSuppliers: ["A Brazilian exporter"],
      risks: [],
      citations: ["https://open-book.example/sources"],
    },
  }
  const score = scoreLead(EXAMPLE_BRIEF, lead)
  const competitive = score.dimensions.find((item) => item.key === "competitive")
  assert.equal(competitive?.points, 10)
  assert.match(competitive?.rationale ?? "", /open buying book/i)
})

test("a thin excerpt still returns a score without invented evidence", () => {
  const lead: Lead = {
    id: "thin",
    name: "Unknown Trading",
    domain: "unknown-trading.example",
    url: "https://unknown-trading.example/",
    country: "",
    exa: {
      title: "Unknown Trading",
      url: "https://unknown-trading.example/",
      domain: "unknown-trading.example",
      text: "Company page.",
      highlights: [],
      summary: "",
    },
  }
  const score = scoreLead(EXAMPLE_BRIEF, lead)
  const evidence = score.dimensions.find((item) => item.key === "evidence")
  const competitive = score.dimensions.find((item) => item.key === "competitive")
  assert.ok(evidence)
  assert.ok(competitive)
  assert.ok(evidence.points <= 3)
  assert.equal(competitive.points, 4)
  assert.match(competitive.rationale, /Parallel has not attached/)
})

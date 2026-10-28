import assert from "node:assert/strict"
import test from "node:test"
import { KANECHOM_BRIEF, LQ_BRIEF } from "../lib/example"
import { icpLevel, qualificationRows } from "../lib/qualify"
import { parallelInstructions } from "../lib/prompts"
import type { Lead, LeadScore } from "../lib/types"

function score(total: number, band: LeadScore["band"], disqualified = false): LeadScore {
  return {
    total,
    band,
    headline: `${band} fit`,
    nextAction: "Call",
    disqualified,
    dimensions: [
      {
        key: "commercial",
        label: "Commercial readiness",
        points: 2,
        max: 10,
        rationale: "No order volume is published.",
        evidence: [],
      },
    ],
  }
}

function lead(name: string, primary: LeadScore, secondary?: LeadScore): Lead {
  return {
    id: name,
    name,
    domain: `${name}.example`,
    url: `https://${name}.example`,
    country: "Ecuador",
    market: "Ecuador",
    exa: {
      title: name,
      url: `https://${name}.example`,
      domain: `${name}.example`,
      text: "Hair care distributor.",
      highlights: [],
      summary: "Imports hair care.",
    },
    score: primary,
    alsoScore: secondary,
  }
}

test("a dual qualification names the stronger supplier and keeps low fits out", () => {
  const rows = qualificationRows(
    [
      lead("Dissol", score(82, "best_fit"), score(40, "weak")),
      lead("E-COS", score(20, "weak", true), score(22, "weak", true)),
    ],
    KANECHOM_BRIEF,
    LQ_BRIEF
  )
  assert.equal(rows[0].bestFit, "Kanechom")
  assert.equal(rows[0].level, "high")
  assert.equal(rows[0].fits[1].level, "low")
  assert.equal(rows[1].bestFit, "neither")
  assert.match(rows[0].qualificationNeeded, /commercial readiness/i)
})

test("Parallel's levels replace the local checklist once they are attached", () => {
  const item = lead("Dissol", score(82, "best_fit"), score(40, "weak"))
  item.context = {
    fitNarrative: "Mass retail importer.",
    knownSuppliers: ["Skala"],
    risks: [],
    citations: [],
    icp: "medium",
    supplierFits: [
      { supplier: "Kanechom", level: "medium" },
      { supplier: "LQ Professional", level: "low" },
    ],
    bestFit: "Kanechom",
    qualificationNeeded: "Confirm an open slot next to Skala.",
  }
  const [row] = qualificationRows([item], KANECHOM_BRIEF, LQ_BRIEF)
  assert.equal(row.fromParallel, true)
  assert.equal(row.level, "medium")
  assert.equal(row.bestFit, "Kanechom")
  assert.equal(row.fits[1].level, "low")
  assert.match(row.qualificationNeeded, /Skala/)
})

test("Parallel is asked to separate fit from the ability to buy", () => {
  const prompt = parallelInstructions(KANECHOM_BRIEF, LQ_BRIEF)
  assert.match(prompt, /not confirmed purchasing intent/)
  assert.match(prompt, /Kanechom and LQ Professional/)
  assert.match(prompt, /Skala/)
  assert.match(prompt, /straightening/)
  assert.match(prompt, /best_fit/)
  assert.match(prompt, /employee count/)
  assert.equal(icpLevel(score(70, "strong")), "high")
  assert.equal(icpLevel(score(50, "possible")), "medium")
  assert.equal(icpLevel(score(10, "weak", true)), "low")
})

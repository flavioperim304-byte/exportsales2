import assert from "node:assert/strict"
import test from "node:test"
import { KANECHOM_BRIEF } from "../lib/example"
import { listLeadRecordsFromRuns, postgresConfigured, toLeadRecord } from "../lib/lead-db"
import { createRun } from "../lib/pipeline"
import { SAMPLE_RUN_ID } from "../lib/ids"
import { sampleRun } from "../lib/sample"

test("postgres stays off when DATABASE_URL is missing", () => {
  assert.equal(Boolean(process.env.DATABASE_URL), false)
  assert.equal(postgresConfigured(), false)
})

test("toLeadRecord copies published contacts and never treats a dump seed as a purchase", () => {
  const run = createRun(KANECHOM_BRIEF)
  run.id = "run-pg-1"
  run.status = "complete"
  run.leads = [
    {
      id: "lead-1",
      name: "Casa Andes",
      domain: "casaandes.example",
      url: "https://casaandes.example",
      country: "Chile",
      seed: "dump",
      exa: {
        title: "Casa Andes",
        url: "https://casaandes.example",
        domain: "casaandes.example",
        text: "",
        highlights: [],
        summary: "",
      },
      extraction: {
        ok: true,
        companyName: "Casa Andes",
        headquarters: "Santiago",
        country: "Chile",
        role: "distributor",
        buys: ["shampoo"],
        sells: ["hair care"],
        markets: ["Chile"],
        certifications: [],
        buyerSignals: [],
        summary: "Distributor",
        excerpt: "",
        email: "compras@casaandes.example",
        phone: "+56 2 0000",
        website: "https://casaandes.example",
      },
      score: {
        total: 62,
        band: "possible",
        headline: "Possible",
        nextAction: "Call",
        disqualified: false,
        dimensions: [],
      },
      fit: {
        level: "medium",
        index: 40,
        note: "No last purchase on the page.",
        missing: ["last_purchase"],
        facts: [],
      },
    },
  ]
  const row = toLeadRecord(run, run.leads[0])
  assert.equal(row.runId, "run-pg-1")
  assert.equal(row.name, "Casa Andes")
  assert.equal(row.seed, "dump")
  assert.equal(row.email, "compras@casaandes.example")
  assert.equal(row.fit, "medium")
  assert.equal(row.band, "possible")
  assert.equal(row.supplier, run.brief.supplierName)
  assert.equal(row.lastPurchase, undefined)
})

test("listLeadRecordsFromRuns skips the coffee sample", () => {
  const live = createRun(KANECHOM_BRIEF)
  live.id = "run-pg-2"
  live.mode = "live"
  live.leads = [
    {
      id: "lead-2",
      name: "Beta Hair",
      domain: "beta.example",
      url: "https://beta.example",
      country: "Kenya",
      exa: {
        title: "Beta Hair",
        url: "https://beta.example",
        domain: "beta.example",
        text: "",
        highlights: [],
        summary: "",
      },
    },
  ]
  const sample = sampleRun()
  assert.equal(sample.id, SAMPLE_RUN_ID)
  const rows = listLeadRecordsFromRuns([sample, live])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, "Beta Hair")
  assert.equal(rows[0].runId, "run-pg-2")
})

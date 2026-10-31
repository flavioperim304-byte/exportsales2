import assert from "node:assert/strict"
import test from "node:test"
import { companiesFromAgent } from "../lib/exa"
import { profileFromAgent } from "../lib/firecrawl"
import { draftFromOpenAI, entryFromOpenAI, judgmentsFromOpenAI } from "../lib/openai"

test("Exa Agent search output becomes companies", () => {
  const companies = companiesFromAgent({
    status: "completed",
    output: {
      structured: {
        companies: [
          {
            name: "Dissol",
            website: "https://dissol.example",
            country: "Ecuador",
            why: "Imports hair care.",
          },
        ],
      },
    },
  })
  assert.equal(companies.length, 1)
  assert.equal(companies[0].website, "https://dissol.example")
})

test("Firecrawl Agent output keeps published contacts and leaves the rest blank", () => {
  const profile = profileFromAgent({
    data: {
      companyName: "Dissol",
      role: "importer",
      summary: "Hair-care importer.",
      email: "compras@dissol.example",
      phone: "",
      whatsapp: "+593 99 000 0000",
      website: "https://dissol.example",
    },
  })
  assert.equal(profile?.email, "compras@dissol.example")
  assert.equal(profile?.phone, "")
  assert.equal(profile?.whatsapp, "+593 99 000 0000")
  assert.equal(profile?.role, "importer")
})

test("OpenAI score JSON becomes a preliminary best fit", () => {
  const rows = judgmentsFromOpenAI({
    choices: [
      {
        message: {
          content: JSON.stringify({
            leads: [
              {
                company: "Dissol",
                icp: "high",
                rationale: "Retail importer.",
                supplier_fits: [{ supplier: "Kanechom", level: "high" }],
                best_fit: "Kanechom",
                qualification_needed: "Confirm an open slot.",
              },
            ],
            purchase_probability: "medium",
            purchase_probability_note: "Importers already carry a professional tier.",
            entry_strategy: "Appoint one importer and train the salon channel before retail.",
          }),
        },
      },
    ],
  })
  assert.equal(rows[0].bestFit, "Kanechom")
  assert.equal(rows[0].icp, "high")
  assert.equal(rows[0].supplierFits[0].level, "high")
  const entry = entryFromOpenAI({
    choices: [
      {
        message: {
          content: JSON.stringify({
            purchase_probability: "medium",
            purchase_probability_note: "Importers already carry a professional tier.",
            entry_strategy: "Appoint one importer and train the salon channel before retail.",
          }),
        },
      },
    ],
  })
  assert.equal(entry.purchaseProbability, "medium")
  assert.match(entry.strategy, /one importer/)
})

test("OpenAI due diligence JSON keeps findings and never a score field we trust", () => {
  const draft = draftFromOpenAI({
    choices: [
      {
        message: {
          content: JSON.stringify({
            structure: "Importer in Bogotá.",
            portfolio: "Skala on the grocery book.",
            import_note: "Last shipment named on the site.",
            recent_activity: "No fair listed.",
            opportunity: "Open a mass SKU next to Skala.",
            approach: "Write the grocery buyer. This is not a confirmed order.",
            findings: [
              {
                kind: "fact",
                polarity: "supports",
                topic: "import",
                text: "Imported a shipment in 2026.",
                urls: ["https://impo.example"],
                evidence_at: "2026-09-01T00:00:00.000Z",
              },
            ],
            citations: [{ url: "https://impo.example", title: "About", published_at: "2026-09-01" }],
          }),
        },
      },
    ],
  })
  assert.equal(draft.findings[0].polarity, "supports")
  assert.equal(draft.narratives.opportunity, "Open a mass SKU next to Skala.")
  assert.equal("opportunityScore" in draft, false)
})

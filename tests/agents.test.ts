import assert from "node:assert/strict"
import test from "node:test"
import { companiesFromAgent } from "../lib/exa"
import { profileFromAgent } from "../lib/firecrawl"
import { judgmentsFromOpenAI } from "../lib/openai"

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
          }),
        },
      },
    ],
  })
  assert.equal(rows[0].bestFit, "Kanechom")
  assert.equal(rows[0].icp, "high")
  assert.equal(rows[0].supplierFits[0].level, "high")
})

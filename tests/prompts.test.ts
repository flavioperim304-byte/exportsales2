import assert from "node:assert/strict"
import test from "node:test"
import { KANECHOM_BRIEF, LQ_BRIEF, validateBrief } from "../lib/example"
import {
  LEADS_PER_COUNTRY,
  exaQuery,
  firecrawlPrompt,
  parallelInstructions,
  researchPrompt,
  targetCountries,
} from "../lib/prompts"
import type { Lead } from "../lib/types"

test("each country gets its own prompt and ten leads", () => {
  const brief = {
    ...KANECHOM_BRIEF,
    markets: "Germany, France",
    instructions: "prefer buyers that already stock Brazilian brands",
  }
  assert.equal(LEADS_PER_COUNTRY, 10)
  assert.deepEqual(targetCountries(brief), ["Germany", "France"])

  const germany = exaQuery(brief, "Germany")
  const france = exaQuery(brief, "France")
  assert.match(germany, /Germany/)
  assert.match(france, /France/)
  assert.doesNotMatch(germany, /France/)
  assert.match(germany, /low-end retail/)
  assert.match(germany, /Brazilian brands/)
  assert.match(firecrawlPrompt(brief, "Germany"), /candidate for Germany/)
  assert.match(firecrawlPrompt(brief, "Germany"), /Brazilian brands/)
  assert.match(parallelInstructions(brief), /Germany, France/)
  assert.match(parallelInstructions(brief), /up to 10 candidates per country/)
})

test("Kanechom and LQ Professional prompts follow different must-haves", () => {
  const kanechom = exaQuery({ ...KANECHOM_BRIEF, markets: "Mexico" }, "Mexico")
  const lq = exaQuery({ ...LQ_BRIEF, markets: "Mexico" }, "Mexico")
  assert.match(kanechom, /Kanechom/)
  assert.match(kanechom, /low-end retail/)
  assert.match(kanechom, /Skala/)
  assert.match(lq, /LQ Professional/)
  assert.match(lq, /straightening/)
  assert.match(lq, /train hairdressers/)
  assert.doesNotMatch(kanechom, /train hairdressers/)
  assert.match(firecrawlPrompt(LQ_BRIEF, "Mexico"), /GMP, ANVISA/)
})

test("both hair briefs search the three markets from the form", () => {
  assert.deepEqual(targetCountries(KANECHOM_BRIEF), [
    "Dominican Republic",
    "South Africa",
    "Chile",
  ])
  assert.deepEqual(targetCountries(LQ_BRIEF), targetCountries(KANECHOM_BRIEF))
  assert.match(exaQuery(KANECHOM_BRIEF, "South Africa"), /Skala/)
  assert.match(exaQuery(LQ_BRIEF, "Dominican Republic"), /beauty salons/)
})

test("a live brief is locked to ten leads per country", () => {
  const parsed = validateBrief({
    ...LQ_BRIEF,
    markets: "Chile, Peru, Colombia",
    leadCount: 4,
    website: "lqprofessional.com.br",
  })
  assert.equal(parsed.error, undefined)
  assert.equal(parsed.brief?.leadCount, 10)
  assert.equal(parsed.brief?.website, "https://lqprofessional.com.br")
  assert.deepEqual(targetCountries(parsed.brief!), ["Chile", "Peru", "Colombia"])
})

test("parallel prompt names the country each candidate was searched for", () => {
  const lead = {
    id: "lead-andes",
    name: "Andes Beauty",
    domain: "andes.example",
    url: "https://andes.example",
    country: "",
    market: "Chile",
    exa: {
      title: "Andes Beauty",
      url: "https://andes.example",
      domain: "andes.example",
      text: "Imports professional hair care.",
      highlights: [],
      summary: "Distributor of professional hair care in Chile.",
    },
  } satisfies Lead
  const prompt = researchPrompt({ ...LQ_BRIEF, markets: "Chile" }, [lead])
  assert.match(prompt, /searched for Chile/)
  assert.match(prompt, /Andes Beauty/)
  assert.match(prompt, /train hairdressers/)
})

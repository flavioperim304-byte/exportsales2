import assert from "node:assert/strict"
import test from "node:test"
import { CADIVEU_COMPETITOR_BRIEF, EXAMPLE_BRIEF, KANECHOM_BRIEF, LQ_BRIEF, presentBrief, validateBrief } from "../lib/example"
import {
  LEADS_PER_COUNTRY,
  buyerTypes,
  competitorQuery,
  exaQuery,
  isPromptOnly,
  exaSystemPrompt,
  firecrawlPrompt,
  openaiInstructions,
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
  assert.match(exaSystemPrompt(), /search mode/)
  assert.match(exaSystemPrompt(), /any other country/)
  assert.match(exaSystemPrompt(), /must not be filled with distributors/)
  assert.deepEqual(targetCountries(brief), ["Germany", "France"])

  const germany = exaQuery(brief, "Germany")
  const france = exaQuery(brief, "France")
  assert.match(germany, /Do not return a company based in another country/)
  assert.match(germany, /buyers for Kanechom/)
  assert.match(germany, /Germany/)
  assert.match(france, /France/)
  assert.doesNotMatch(germany, /France/)
  assert.match(germany, /low-end retail/)
  assert.match(germany, /Brazilian brands/)
  assert.match(firecrawlPrompt(brief, "Germany"), /candidate for Germany/)
  assert.match(firecrawlPrompt(brief, "Germany"), /WhatsApp/)
  assert.match(firecrawlPrompt(brief, "Germany"), /Brazilian brands/)
  assert.match(parallelInstructions(brief), /Germany, France/)
  assert.match(parallelInstructions(brief), /up to 10 candidates per country/)
  assert.match(parallelInstructions(brief), /already sell this category in Germany, France/)
  assert.match(parallelInstructions(brief), /never headquarters/)
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
  assert.match(openaiInstructions(KANECHOM_BRIEF), /nazih\.com/)
  assert.match(openaiInstructions(KANECHOM_BRIEF), /gemegypt\.com/)
  assert.match(openaiInstructions(KANECHOM_BRIEF), /ssiz\.in/)
  assert.match(openaiInstructions(KANECHOM_BRIEF), /raises icp/)
  assert.match(parallelInstructions(LQ_BRIEF), /Nazih Trading LLC/)
  assert.match(parallelInstructions(LQ_BRIEF), /does not confirm a Kanechom or LQ purchase/)
  assert.match(firecrawlPrompt(KANECHOM_BRIEF, "Chile"), /Nazih Trading/)
  assert.doesNotMatch(openaiInstructions(EXAMPLE_BRIEF), /nazih\.com/)
})

test("a competitor search covers several countries and leaves the named ones out", () => {
  const brief = presentBrief(CADIVEU_COMPETITOR_BRIEF)
  assert.equal(brief.searchKind, "competitors")
  assert.equal(brief.exaEffort, "ultra")
  assert.equal(brief.countryCount, 5)
  const query = competitorQuery(brief)
  assert.match(query, /5 countries/)
  assert.match(query, /Ecuador, Colombia, India/)
  assert.match(query, /direct competitor distributors/)
  assert.match(query, /Cadiveu/)
  assert.match(parallelInstructions(brief), /direct competitor/)
  assert.equal(validateBrief({ ...brief, markets: "" }).error, undefined)
})

test("a single prompt replaces buyer type, must-have, and exclusion fields", () => {
  const folded = presentBrief({ ...KANECHOM_BRIEF, markets: "Costa Rica" })
  assert.equal(isPromptOnly(folded), true)
  assert.equal(folded.buyerTypes, "")
  assert.equal(folded.mustHaves, "")
  assert.equal(folded.exclusions, "")
  assert.match(folded.instructions ?? "", /Skala/)
  assert.match(folded.instructions ?? "", /Buyer types:/)
  const query = exaQuery(folded, "Costa Rica")
  assert.match(query, /Search only in Costa Rica/)
  assert.match(query, /Skala/)
  assert.doesNotMatch(query, /Must-haves: none/)
  const parsed = validateBrief(folded)
  assert.equal(parsed.error, undefined)
  assert.equal(validateBrief({ ...folded, instructions: "" }).error, "Write the prompt for this search.")
})

test("each listed buyer type is searched on its own", () => {
  assert.deepEqual(buyerTypes(LQ_BRIEF), ["distributor", "wholesaler", "trading company"])
  const wholesale = exaQuery(LQ_BRIEF, "Dominican Republic", "wholesaler")
  assert.match(wholesale, /only for this buyer type: wholesaler/)
  assert.match(wholesale, /Return wholesaler even when the additional instructions/)
  assert.doesNotMatch(wholesale, /buyer type: distributor,/)
  const page = firecrawlPrompt(LQ_BRIEF, "Dominican Republic", "wholesaler")
  assert.match(page, /searched as this buyer type: wholesaler/)
  assert.match(page, /Buyer types in this brief: distributor, wholesaler, trading company/)
  assert.match(openaiInstructions(LQ_BRIEF), /matches any one of these types/)
  assert.match(parallelInstructions(LQ_BRIEF), /matches any one of these types/)
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

test("a long prompt still leaves room for the purchase probability", () => {
  const brief = {
    ...LQ_BRIEF,
    products: "",
    differentiators: "",
    certifications: "",
    buyerTypes: "",
    mustHaves: "",
    exclusions: "",
    markets: "Chile",
    instructions: "Prefer salons. ".repeat(400),
  }
  const lead = {
    id: "lead-andes",
    name: "Andes Beauty",
    domain: "andes.example",
    url: "https://andes.example",
    country: "Chile",
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
  const prompt = researchPrompt(brief, [lead])
  assert.match(prompt, /purchase_probability/)
  assert.match(prompt, /entry_strategy/)
  assert.match(prompt, /Andes Beauty/)
  assert.ok(prompt.length <= 20000)
  assert.match(openaiInstructions(brief), /purchase_probability/)
})

test("parallel prompt names the country each candidate was searched for", () => {
  const lead = {
    id: "lead-andes",
    name: "Andes Beauty",
    domain: "andes.example",
    url: "https://andes.example",
    country: "",
    market: "Chile",
    buyerType: "wholesaler",
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
  assert.match(prompt, /searched as wholesaler/)
  assert.match(prompt, /Andes Beauty/)
  assert.match(prompt, /train hairdressers/)
})

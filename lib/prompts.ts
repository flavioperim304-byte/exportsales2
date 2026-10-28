import type { Brief, Lead } from "./types"
import { clip, splitList } from "./text"

export const LEADS_PER_COUNTRY = 10

export function targetCountries(brief: Brief): string[] {
  return splitList(brief.markets)
}

function extra(brief: Brief): string {
  const note = brief.instructions?.trim()
  return note ? `Additional instructions: ${note}` : ""
}

export function buyerTypes(brief: Brief): string[] {
  return splitList(brief.buyerTypes)
}

export function exaQuery(brief: Brief, country: string, buyerType?: string): string {
  const type = buyerType?.trim() || brief.buyerTypes.trim() || "importer, distributor, or wholesaler"
  return [
    `Find ${type} in ${country} that buy or import ${brief.products}.`,
    `This search is only for this buyer type: ${type}. Do not fill the list with a different type.`,
    `Supplier to place: ${brief.supplierName} from ${brief.originCountry}.`,
    brief.mustHaves ? `The buyer must show: ${brief.mustHaves}.` : "",
    brief.exclusions ? `Do not return: ${brief.exclusions}.` : "",
    brief.certifications ? `Relevant certifications: ${brief.certifications}.` : "",
    brief.differentiators ? `What the supplier offers: ${brief.differentiators}.` : "",
    `Return ${type} even when the additional instructions mention a narrower buyer type.`,
    extra(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

export function exaBackupQuery(brief: Brief, country: string, buyerType?: string): string {
  const type = buyerType?.trim() || brief.buyerTypes.trim() || "importer, distributor, or wholesaler"
  return [
    `More ${type} in ${country} that buy or import ${brief.products}.`,
    `This search is only for this buyer type: ${type}. Do not fill the list with a different type.`,
    brief.mustHaves ? `Must show: ${brief.mustHaves}.` : "",
    brief.exclusions ? `Do not return: ${brief.exclusions}.` : "",
    extra(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

export function firecrawlPrompt(brief: Brief, country: string, buyerType?: string): string {
  const type = buyerType?.trim()
  return [
    "Extract a buyer profile for an export salesperson.",
    `Supplier: ${brief.supplierName} (${brief.originCountry}). Products: ${brief.products}.`,
    country
      ? `This company was retrieved as a candidate for ${country}.`
      : `Target markets: ${brief.markets}.`,
    type ? `This company was searched as this buyer type: ${type}. Record whether the page shows that type.` : "",
    brief.buyerTypes ? `Buyer types in this brief: ${brief.buyerTypes}.` : "",
    brief.mustHaves ? `Look for evidence of these must-haves: ${brief.mustHaves}.` : "",
    brief.exclusions ? `Note if the page matches an exclusion: ${brief.exclusions}.` : "",
    brief.certifications
      ? `Certifications that matter to the supplier: ${brief.certifications}.`
      : "",
    "Use only facts stated on the page or on pages it links to. Unknown fields stay empty.",
    "Collect published contact details: email, phone, WhatsApp, and the company website. Leave a contact blank when it is not published. Do not guess an address or a number.",
    "buyerSignals must be short phrases about the buyer type named above, including importing, wholesale coverage, or trading.",
    extra(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

export function searchBrief(brief: Brief, also?: Brief): Brief {
  if (!also) return brief
  return {
    ...brief,
    supplierName: `${brief.supplierName} and ${also.supplierName}`,
    products: `${brief.products}. Also ${also.products}`,
    buyerTypes: `${brief.buyerTypes}. Also ${also.buyerTypes}`,
    mustHaves: [brief.mustHaves, also.mustHaves].filter(Boolean).join(". "),
    differentiators: [brief.differentiators, also.differentiators].filter(Boolean).join(" "),
    exclusions: [brief.exclusions, also.exclusions].filter(Boolean).join(", "),
    instructions: [brief.instructions, also.instructions].filter(Boolean).join(" "),
  }
}

export function exaSystemPrompt(): string {
  return [
    "You are in search mode.",
    `Return at most ${LEADS_PER_COUNTRY} real companies of the single buyer type named in the query.`,
    "A wholesaler search must not be filled with distributors. A trading-company search must not be filled with distributors. If that type is scarce, return fewer companies.",
    "Each company needs its official website.",
    "Do not score the companies, do not write a market report, and do not invent email addresses or phone numbers.",
    "Skip the supplier’s own website. Prefer a company site over a social profile.",
  ].join(" ")
}

export function openaiInstructions(brief: Brief, also?: Brief): string {
  const suppliers = also
    ? `${brief.supplierName} and ${also.supplierName}`
    : brief.supplierName
  return [
    "You score export leads. Use only the evidence in the candidate cards. Do not browse and do not invent contacts, volumes, or brands.",
    `Suppliers: ${suppliers}, from ${brief.originCountry}.`,
    `${brief.supplierName}: ${brief.products}. Buyer types: ${brief.buyerTypes || "unpublished"}. A company fits the channel when it matches any one of these types. Must-haves: ${brief.mustHaves || "none"}.`,
    also
      ? `${also.supplierName}: ${also.products}. Buyer types: ${also.buyerTypes || "unpublished"}. A company fits the channel when it matches any one of these types. Must-haves: ${also.mustHaves || "none"}.`
      : "",
    "Score the company against the buyer type it was searched as, and against the other types in the brief. Do not lower the score only because it is a wholesaler or a trading company rather than a distributor.",
    "For every candidate set icp and each supplier fit to high, medium, or low. Set best_fit to the supplier to pursue, both, or neither.",
    "qualification_needed is what a salesperson still has to confirm. High means product and channel fit. It is not confirmed purchasing intent.",
    extra(brief),
  ]
    .filter(Boolean)
    .join("\n")
}

export function parallelInstructions(brief: Brief, also?: Brief): string {
  const countries = targetCountries(brief)
  const suppliers = also
    ? `${brief.supplierName} and ${also.supplierName}`
    : brief.supplierName
  return [
    "You are supporting an export salesperson. OpenAI already assigned a preliminary high, medium, or low and a best fit. Those levels are not confirmed purchasing intent. Refine them with current web sources. Cite URLs. Do not invent companies, contacts, or figures. You may change icp, each supplier fit, and best_fit when the sources disagree with the preliminary score, and say what changed.",
    `Suppliers to place: ${suppliers}, from ${brief.originCountry}.`,
    `${brief.supplierName}: ${brief.products}. Buyer types: ${brief.buyerTypes || "unpublished"}. A company fits the channel when it matches any one of these types. Must-haves: ${brief.mustHaves || "none"}. ${brief.differentiators || ""}`,
    also
      ? `${also.supplierName}: ${also.products}. Buyer types: ${also.buyerTypes || "unpublished"}. A company fits the channel when it matches any one of these types. Must-haves: ${also.mustHaves || "none"}. ${also.differentiators || ""}`
      : "",
    "Each candidate names the buyer type it was searched as. Judge that type. Do not lower the score only because the company is a wholesaler or a trading company rather than a distributor.",
    `Websites to exclude as buyers: ${[brief.website, also?.website].filter(Boolean).join(", ") || "unpublished"}.`,
    `Certifications: ${brief.certifications || "unpublished"}.`,
    countries.length
      ? `Write the outlook separately for each target country: ${countries.join(", ")}. The shortlist has up to ${LEADS_PER_COUNTRY} candidates per country.`
      : `Target markets: ${brief.markets || "unpublished"}.`,
    `Exclusions: ${brief.exclusions || "none stated"}.`,
    extra(brief),
    also?.instructions ? `Additional instructions: ${also.instructions.trim()}` : "",
    "Separate product fit from willingness and authority to buy. Name a competitor brand only when a source names it. Do not treat an employee count as distribution capacity. If you cite a number, include the year and the source. If a company is owned by or exclusive to a brand group, say so and do not treat it as an independent distributor.",
    "Say who to approach first for each supplier, the public outreach route when one is published, and a specific opening offer. For every candidate set icp and each supplier fit to high, medium, or low. Set best_fit to the supplier to pursue, both, or neither. qualification_needed is what a salesperson still has to confirm. Rank only within this list. These levels are not a probability of buying.",
    "Return the category outlook in the target countries, how buyers purchase, import signals, up to five competitor suppliers (not the candidates), and for each candidate a fit note, known current suppliers if published, risks, and citation URLs. If a candidate is not a buyer, say so in risks.",
  ]
    .filter(Boolean)
    .join("\n")
}

export function researchPrompt(brief: Brief, leads: Lead[], also?: Brief): string {
  const cards = leads
    .map((lead, index) => {
      const extraction = lead.extraction
      const card = [
        lead.market ? `searched for ${lead.market}` : "",
        lead.buyerType ? `searched as ${lead.buyerType}` : "",
        lead.name,
        lead.url,
        extraction?.country || lead.country,
        extraction?.role,
        extraction?.buys?.slice(0, 4).join("; "),
        extraction?.email ? `email ${extraction.email}` : "",
        extraction?.phone ? `phone ${extraction.phone}` : "",
        extraction?.whatsapp ? `whatsapp ${extraction.whatsapp}` : "",
        lead.openai
          ? `OpenAI preliminary: ${lead.openai.icp}, best fit ${lead.openai.bestFit}. ${clip(lead.openai.rationale, 180)}`
          : "OpenAI preliminary: unscored.",
        clip(extraction?.summary || lead.exa.summary || lead.exa.text, 180),
      ]
        .filter(Boolean)
        .join(" — ")
      return `${index + 1}. ${card}`
    })
    .join("\n")
  return [parallelInstructions(brief, also), "Candidates:", cards].join("\n").slice(0, 14000)
}

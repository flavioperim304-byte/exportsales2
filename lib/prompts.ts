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

export function exaQuery(brief: Brief, country: string): string {
  return [
    `Companies in ${country} that import, distribute, or wholesale ${brief.products}.`,
    `Supplier to place: ${brief.supplierName} from ${brief.originCountry}.`,
    `Buyer types: ${brief.buyerTypes}.`,
    brief.mustHaves ? `The buyer must show: ${brief.mustHaves}.` : "",
    brief.exclusions ? `Do not return: ${brief.exclusions}.` : "",
    brief.certifications ? `Relevant certifications: ${brief.certifications}.` : "",
    brief.differentiators ? `What the supplier offers: ${brief.differentiators}.` : "",
    extra(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

export function exaBackupQuery(brief: Brief, country: string): string {
  return [
    `Importers, distributors, and wholesalers of ${brief.products} based in ${country}.`,
    brief.buyerTypes,
    brief.mustHaves ? `Must show: ${brief.mustHaves}.` : "",
    extra(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

export function firecrawlPrompt(brief: Brief, country: string): string {
  return [
    "Extract a buyer profile for an export salesperson.",
    `Supplier: ${brief.supplierName} (${brief.originCountry}). Products: ${brief.products}.`,
    country
      ? `This company was retrieved as a candidate for ${country}.`
      : `Target markets: ${brief.markets}.`,
    `Ideal buyer: ${brief.buyerTypes}.`,
    brief.mustHaves ? `Look for evidence of these must-haves: ${brief.mustHaves}.` : "",
    brief.exclusions ? `Note if the page matches an exclusion: ${brief.exclusions}.` : "",
    brief.certifications
      ? `Certifications that matter to the supplier: ${brief.certifications}.`
      : "",
    "Use only facts stated on the page. Unknown fields stay empty.",
    "buyerSignals must be short phrases that appear on the page about importing, distributing, retail coverage, or training.",
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

export function parallelInstructions(brief: Brief, also?: Brief): string {
  const countries = targetCountries(brief)
  const suppliers = also
    ? `${brief.supplierName} and ${also.supplierName}`
    : brief.supplierName
  return [
    "You are supporting an export salesperson. Score product and channel fit yourself from current web sources. High, medium, and low are not confirmed purchasing intent. Cite URLs. Do not invent companies, contacts, or figures.",
    `Suppliers to place: ${suppliers}, from ${brief.originCountry}.`,
    `${brief.supplierName}: ${brief.products}. Buyer: ${brief.buyerTypes}. Must-haves: ${brief.mustHaves || "none"}. ${brief.differentiators || ""}`,
    also
      ? `${also.supplierName}: ${also.products}. Buyer: ${also.buyerTypes}. Must-haves: ${also.mustHaves || "none"}. ${also.differentiators || ""}`
      : "",
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
        lead.name,
        lead.url,
        extraction?.country || lead.country,
        extraction?.role,
        extraction?.buys?.slice(0, 4).join("; "),
        clip(extraction?.summary || lead.exa.summary || lead.exa.text, 180),
      ]
        .filter(Boolean)
        .join(" — ")
      return `${index + 1}. ${card}`
    })
    .join("\n")
  return [parallelInstructions(brief, also), "Candidates:", cards].join("\n").slice(0, 14000)
}

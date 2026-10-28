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

export function parallelInstructions(brief: Brief): string {
  const countries = targetCountries(brief)
  return [
    "You are supporting an export salesperson. Research the market and the named buyer candidates with current web sources. Cite URLs. Do not invent companies or figures.",
    `Supplier: ${brief.supplierName} (${brief.originCountry}). Website: ${brief.website || "unpublished"}.`,
    `Products: ${brief.products}.`,
    `Differentiators: ${brief.differentiators || "unpublished"}.`,
    `Certifications: ${brief.certifications || "unpublished"}.`,
    `Ideal buyer: ${brief.buyerTypes}.`,
    countries.length
      ? `Write the outlook separately for each target country: ${countries.join(", ")}. The shortlist has up to ${LEADS_PER_COUNTRY} candidates per country.`
      : `Target markets: ${brief.markets || "unpublished"}.`,
    `Must-haves: ${brief.mustHaves || "none stated"}. Exclusions: ${brief.exclusions || "none stated"}.`,
    extra(brief),
    "Return the category outlook in the target countries, how buyers purchase, import signals, up to five competitor suppliers (not the candidates), and for each candidate a fit note, known current suppliers if published, risks, and citation URLs. If a candidate is not a buyer, say so in risks.",
  ]
    .filter(Boolean)
    .join("\n")
}

export function researchPrompt(brief: Brief, leads: Lead[]): string {
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
  return [parallelInstructions(brief), "Candidates:", cards].join("\n").slice(0, 14000)
}

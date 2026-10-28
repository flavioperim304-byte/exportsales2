import type { Brief, Lead } from "./types"
import { clip, splitList } from "./text"

export const LEADS_PER_COUNTRY = 10

export function targetCountries(brief: Brief): string[] {
  return splitList(brief.markets)
}

function marketAsk(): string {
  return [
    "purchase_probability is high, medium, or low for the market in this search: the chance a qualified buyer there would take the brand on. Keep it separate from icp. Do not invent a percentage.",
    "entry_strategy is a short plan for this market, using practices that have worked when professional brands enter a new country: appoint one importer before many retailers, train that channel, open with a non-exclusive trial, and price inside the local professional tier. Name a practice only when a source supports it. Do not invent a statistic.",
  ].join(" ")
}

function extra(brief: Brief): string {
  const note = brief.instructions?.trim()
  return note ? `Additional instructions: ${note}` : ""
}

/** The salesperson wrote one prompt. The split buyer fields are empty. */
export function isPromptOnly(brief: Brief): boolean {
  const prompt = brief.instructions?.trim()
  if (!prompt) return false
  return ![
    brief.products,
    brief.buyerTypes,
    brief.mustHaves,
    brief.exclusions,
    brief.differentiators,
    brief.certifications,
  ].some((value) => value.trim())
}

function promptSearch(brief: Brief, country: string): string {
  return [
    brief.instructions?.trim() ?? "",
    `Search only in ${country}. Every company must operate in ${country}. Do not return a company based in another country.`,
    `These are buyers for ${brief.supplierName}, from ${brief.originCountry}. Do not return ${brief.supplierName} itself or a different supplier.`,
  ].join("\n\n")
}

export function competitorQuery(brief: Brief): string {
  const count = brief.countryCount && brief.countryCount > 0 ? brief.countryCount : 5
  const named = brief.markets.trim()
  const skip = brief.excludedMarkets?.trim()
  return [
    brief.instructions?.trim() || `Find distributors of ${brief.supplierName}.`,
    named ? `Only these countries: ${named}.` : `Cover ${count} countries.`,
    skip ? `Do not include these countries: ${skip}.` : "",
    `In each country return the company that distributes ${brief.supplierName} and the direct competitor distributors in that same country.`,
    `The brand is from ${brief.originCountry}. A direct competitor distributor imports a rival brand there. Do not return retailers or the brand’s own headquarters.`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function competitorSystemPrompt(): string {
  return [
    "You are in search mode.",
    "Return real distributor companies and their official websites.",
    "For every country, include the distributor of the named brand and the direct competitor distributors in that country.",
    "A direct competitor imports a rival brand in the same country. Skip retailers, salons, and the brand itself.",
    "Do not return a company in an excluded country.",
    "Do not score the companies and do not invent email addresses or phone numbers.",
  ].join(" ")
}

export function buyerTypes(brief: Brief): string[] {
  return splitList(brief.buyerTypes)
}

export function exaQuery(brief: Brief, country: string, buyerType?: string): string {
  if (isPromptOnly(brief)) return promptSearch(brief, country)
  const type = buyerType?.trim() || brief.buyerTypes.trim() || "importer, distributor, or wholesaler"
  return [
    `Find ${type} in ${country} that buy or import ${brief.products}.`,
    `Every company must operate in ${country}. Do not return a company based in another country.`,
    `This search is only for this buyer type: ${type}. Do not fill the list with a different type.`,
    `These are buyers for ${brief.supplierName}, from ${brief.originCountry}. Do not return ${brief.supplierName} itself or a different supplier.`,
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
  if (isPromptOnly(brief)) return promptSearch(brief, country)
  const type = buyerType?.trim() || brief.buyerTypes.trim() || "importer, distributor, or wholesaler"
  return [
    `More ${type} in ${country} that buy or import ${brief.products}.`,
    `Every company must operate in ${country}. Do not return a company based in another country.`,
    `This search is only for this buyer type: ${type}. Do not fill the list with a different type.`,
    `These are buyers for ${brief.supplierName}. Do not return ${brief.supplierName} itself or a different supplier.`,
    brief.mustHaves ? `Must show: ${brief.mustHaves}.` : "",
    brief.exclusions ? `Do not return: ${brief.exclusions}.` : "",
    extra(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

export function firecrawlPrompt(brief: Brief, country: string, buyerType?: string): string {
  if (brief.searchKind === "competitors") {
    return [
      "Extract a buyer profile for an export salesperson.",
      `Brand: ${brief.supplierName} (${brief.originCountry}).`,
      country
        ? `This company was retrieved in ${country}.`
        : "The country is whatever the page states.",
      buyerType ? `The search labeled this company as: ${buyerType}.` : "",
      "Confirm whether the page shows this company distributing the brand, or distributing a rival brand in the same country.",
      brief.instructions?.trim() ?? "",
      "Use only facts stated on the page or on pages it links to. Unknown fields stay empty.",
      "Collect published contact details: email, phone, WhatsApp, and the company website. Leave a contact blank when it is not published. Do not guess an address or a number.",
    ]
      .filter(Boolean)
      .join("\n")
  }
  if (isPromptOnly(brief)) {
    return [
      "Extract a buyer profile for an export salesperson.",
      `Supplier: ${brief.supplierName} (${brief.originCountry}).`,
      country
        ? `This company was retrieved as a candidate for ${country}.`
        : `Target markets: ${brief.markets}.`,
      "Judge the page only against this prompt:",
      brief.instructions?.trim() ?? "",
      "Use only facts stated on the page or on pages it links to. Unknown fields stay empty.",
      "Collect published contact details: email, phone, WhatsApp, and the company website. Leave a contact blank when it is not published. Do not guess an address or a number.",
      "buyerSignals must be short phrases taken from the page about how this company buys or sells.",
    ].join("\n")
  }
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
    "Every company must be in the one country named in the query. Omit a company from any other country.",
    "Return buyers for the supplier named in the query. Do not return that supplier, and do not return a different supplier.",
    "A wholesaler search must not be filled with distributors. A trading-company search must not be filled with distributors. If that type is scarce, return fewer companies.",
    "Each company needs its official website.",
    "Do not score the companies, do not write a market report, and do not invent email addresses or phone numbers.",
    "Skip the supplier’s own website. Prefer a company site over a social profile.",
  ].join(" ")
}

export function openaiInstructions(brief: Brief, also?: Brief): string {
  if (brief.searchKind === "competitors" && !also) {
    return [
      "You classify distributor leads. Use only the evidence in the candidate cards. Do not browse and do not invent brands or countries.",
      `Brand: ${brief.supplierName}, from ${brief.originCountry}.`,
      brief.excludedMarkets ? `Excluded countries: ${brief.excludedMarkets}.` : "",
      "A high score means the company distributes this brand, or it is a direct competitor distributor of a rival brand in the same country. Low means a retailer, a salon, or an unrelated company.",
      "Set best_fit to the brand name when they distribute it, direct competitor when they import a rival, or neither.",
      brief.instructions?.trim() ?? "",
      "qualification_needed is what a salesperson still has to confirm. icp is not the purchase probability.",
      marketAsk(),
    ]
      .filter(Boolean)
      .join("\n")
  }
  if (isPromptOnly(brief) && !also) {
    return [
      "You score export leads. Use only the evidence in the candidate cards. Do not browse and do not invent contacts, volumes, or brands.",
      `Supplier: ${brief.supplierName}, from ${brief.originCountry}.`,
      brief.website ? `Do not treat ${brief.website} as a buyer.` : "",
      "Score against the prompt below. Do not add must-haves or exclusions that the prompt does not state.",
      brief.instructions?.trim() ?? "",
      "For every candidate set icp and each supplier fit to high, medium, or low. Set best_fit to the supplier to pursue, both, or neither.",
      "qualification_needed is what a salesperson still has to confirm. High icp means product and channel fit. It is not the purchase probability.",
      marketAsk(),
    ]
      .filter(Boolean)
      .join("\n")
  }
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
    "qualification_needed is what a salesperson still has to confirm. High icp means product and channel fit. It is not the purchase probability.",
    marketAsk(),
    extra(brief),
  ]
    .filter(Boolean)
    .join("\n")
}

export function parallelInstructions(brief: Brief, also?: Brief): string {
  const countries = targetCountries(brief)
  if (brief.searchKind === "competitors" && !also) {
    const count = brief.countryCount && brief.countryCount > 0 ? brief.countryCount : 5
    return [
      "You are mapping local distributors of one brand and their direct competitors. Cite URLs. Do not invent companies, countries, or brands.",
      `Brand: ${brief.supplierName}, from ${brief.originCountry}.`,
      countries.length
        ? `Look only in: ${countries.join(", ")}.`
        : `Cover ${count} countries.`,
      brief.excludedMarkets ? `Do not include: ${brief.excludedMarkets}.` : "",
      "For each country, confirm who distributes the brand and name the direct competitor distributors who import rival brands there. A retailer or a salon is not a direct competitor distributor.",
      brief.instructions?.trim() ?? "",
      "Set icp high when the company is the brand’s distributor or a direct competitor distributor, medium when the role is likely but not proven, and low when it is unrelated. Set best_fit to the brand name, direct competitor, or neither.",
      "qualification_needed is what still has to be confirmed. Put rival brand names in known suppliers when a source names them. In competitors, list direct competitor distributors that are not already in the candidate list.",
      marketAsk(),
    ]
      .filter(Boolean)
      .join("\n")
  }
  if (isPromptOnly(brief) && !also) {
    return [
      "You are supporting an export salesperson. OpenAI already assigned a preliminary high, medium, or low and a best fit. Those levels are not confirmed purchasing intent. Refine them with current web sources. Cite URLs. Do not invent companies, contacts, or figures. You may change icp, each supplier fit, and best_fit when the sources disagree with the preliminary score, and say what changed.",
      `Supplier to place: ${brief.supplierName}, from ${brief.originCountry}.`,
      brief.website ? `Website to exclude as a buyer: ${brief.website}.` : "",
      countries.length
        ? `Write the outlook for ${countries.join(", ")}. The shortlist has up to ${LEADS_PER_COUNTRY} candidates per country.`
        : `Target markets: ${brief.markets || "unpublished"}.`,
      "Refine the score against this prompt only. Do not add must-haves or exclusions that the prompt does not state.",
      brief.instructions?.trim() ?? "",
      "Separate product fit from willingness and authority to buy. Name a competitor brand only when a source names it. Do not treat an employee count as distribution capacity. If you cite a number, include the year and the source. If a company is owned by or exclusive to a brand group, say so and do not treat it as an independent distributor.",
      "Say who to approach first, the public outreach route when one is published, and a specific opening offer. For every candidate set icp and the supplier fit to high, medium, or low. Set best_fit to the supplier to pursue or neither. qualification_needed is what a salesperson still has to confirm. Rank only within this list. icp is not the purchase probability.",
      marketAsk(),
      "Return the category outlook in the target countries, how buyers purchase, import signals, up to five competitor suppliers (not the candidates), and for each candidate a fit note, known current suppliers if published, risks, and citation URLs. If a candidate is not a buyer, say so in risks.",
    ]
      .filter(Boolean)
      .join("\n")
  }
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
    "Say who to approach first for each supplier, the public outreach route when one is published, and a specific opening offer. For every candidate set icp and each supplier fit to high, medium, or low. Set best_fit to the supplier to pursue, both, or neither. qualification_needed is what a salesperson still has to confirm. Rank only within this list. icp is not the purchase probability.",
    marketAsk(),
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
  const instructions = parallelInstructions(brief, also)
  const header = `${instructions}\nCandidates:\n`
  const room = Math.max(0, 20000 - header.length)
  return `${header}${cards.slice(0, room)}`
}

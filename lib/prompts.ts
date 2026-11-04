import { activityLine } from "./activity"
import { anchorPromptBlock, briefUsesAnchorDistributors, firecrawlAnchorLine } from "./anchors"
import { buyingEvidenceLine, computeFitProbability, fitProbabilityLine } from "./fit-probability"
import { ragLine } from "./rag"
import type { Brief, Lead } from "./types"
import { clip, splitList } from "./text"

function anchorsFor(brief: Brief): string {
  return briefUsesAnchorDistributors(brief) ? anchorPromptBlock() : ""
}

export const LEADS_PER_COUNTRY = 10

export function targetCountries(brief: Brief): string[] {
  return splitList(brief.markets)
}

function marketAsk(): string {
  return [
    "purchase_probability is high, medium, or low for the market in this search: the chance a qualified buyer there would take the brand on. Keep it separate from icp. Do not invent a percentage.",
    "High purchase_probability needs at least two published commercial facts among last purchase, stock, brand performance, sales, and a competitor move, plus recent public activity. If those fields are unpublished, the call is medium or low. Do not invent a last purchase, a stock level, a sales figure, or a response rate.",
    "entry_strategy is a short plan for this market, using practices that have worked when professional brands enter a new country: appoint one importer before many retailers, train that channel, open with a non-exclusive trial, and price inside the local professional tier. Name a practice only when a source supports it. Do not invent a statistic.",
  ].join(" ")
}

function buyingAsk(): string {
  return "On each company, look for last purchase or shipment, stock or restock, how current brands are performing, published sales or volume, and a competitor move. Quote the source. Leave a field empty when it is not published. A company that only has a brochure is not a high fit. A job ad for sales or purchasing is a supporting signal, not purchase intent. Do not set best_fit from ICP, a brochure, social posts, or hiring alone. If last purchase, stock, and sales are unpublished, best_fit is neither."
}

function dumpAsk(): string {
  return "Dump + API: only companies Exa and Firecrawl confirmed reach this scoring step. HS shipments on the card are a strong importer signal — the account moves cargo — not a Kanechom or LQ purchase. Do not copy dump volume into last_purchase. Do not set best_fit from the dump alone. Score channel fit; Parallel still refines."
}

function extra(brief: Brief): string {
  const note = brief.instructions?.trim()
  return note ? `Additional instructions: ${note}` : ""
}

function firecrawlContactAsk(): string {
  return [
    "Scrape and crawl this company's website (home, contact, about, team, careers) and search the web for the same company.",
    "Bring primarily: the key person in the company, published email, WhatsApp, phone, and the website, with details from the crawled content, and any latest hires.",
    "Leave a field empty when it is not published. Do not guess a name, email, address, or number.",
  ].join(" ")
}

function exaBuyerSignalAsk(brief?: Brief): string {
  return [
    "buyerSignals must be short phrases taken from the page about how this company buys or sells.",
    brief ? firecrawlAnchorLine(brief) : "",
  ]
    .filter(Boolean)
    .join(" ")
}

/** Hard rule for every model call. Absence is unpublished, never a filled-in fact. */
export function evidenceRule(): string {
  return [
    "EVIDENCE RULE (mandatory): Never invent.",
    "Use only published evidence in the candidate cards, cited URLs, page extracts, and the RAG line.",
    "If a contact, volume, brand in the book, last purchase, stock level, sales figure, exclusivity, import, employee count, or intent to buy is not in that evidence, leave it empty or write unpublished.",
    "Do not fill gaps from training memory, typical distributors, similar countries, or what a company like this would usually do.",
    "Absence is not the opposite fact.",
    "RAG similarity is a past dashboard profile, never a Kanechom or LQ purchase.",
    "A RAG neighbor is a different company. Do not copy its contacts, brands, or purchases onto this lead.",
  ].join(" ")
}

function cardAsk(target: "a brand" | "a supplier", keep = false): string {
  const verb = keep ? "keep" : "set"
  return [
    "Use the public activity line, the RAG line, and the fit-probability line on each card.",
    `Do not ${verb} icp high or best_fit to ${target} when last purchase, stock, and sales are unpublished.`,
    "Hiring, social posts, and ICP fit are not purchase intent.",
    "A RAG neighbor is not purchase intent either.",
  ].join(" ")
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
    evidenceRule(),
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
    exaBuyerSignalAsk(brief),
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
    exaBuyerSignalAsk(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

export function dumpConfirmQueryLine(brief: Brief, country: string): string {
  return [
    evidenceRule(),
    `Confirm whether named importers in ${country} exist as ${brief.products || "hair care"} importers or distributors.`,
    "Exa looks up each dump name. Firecrawl then scrapes and crawls the official site and the web.",
    "A trade dump never confirms a purchase. Logistics and global brand subsidiaries stay out.",
    extra(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

export function firecrawlPrompt(brief: Brief, country: string, buyerType?: string): string {
  if (brief.searchKind === "dump") {
    return [
      evidenceRule(),
      firecrawlContactAsk(),
      `Supplier: ${brief.supplierName} (${brief.originCountry}).`,
      country
        ? `This name came from a trade dump for ${country}. Confirm or reject it from the crawled pages.`
        : "This name came from a trade dump. Confirm or reject it from the crawled pages.",
      "Confirm whether the pages show a local importer or distributor of hair care, shampoo, or cosmetics.",
      "Reject logistics, freight forwarders, Amazon, salons with no wholesale, and global brand subsidiaries (Unilever, P&G, L'Oréal, Avon, Genomma, PriceSmart, Alfaparf, Belcorp, Mesoestetic, Arabela, Feduro, Henkel).",
      "The dump is not evidence. Only facts on the crawled pages and the web search count.",
      buyerType ? `The search labeled this company as: ${buyerType}.` : "",
      brief.instructions?.trim() ?? "",
    ]
      .filter(Boolean)
      .join("\n")
  }
  if (brief.searchKind === "competitors") {
    return [
      evidenceRule(),
      firecrawlContactAsk(),
      `Brand: ${brief.supplierName} (${brief.originCountry}).`,
      country
        ? `This company was retrieved in ${country}.`
        : "The country is whatever the page states.",
      buyerType ? `The search labeled this company as: ${buyerType}.` : "",
      "Confirm whether the crawled pages show this company distributing the brand, or distributing a rival brand in the same country.",
      brief.instructions?.trim() ?? "",
    ]
      .filter(Boolean)
      .join("\n")
  }
  if (isPromptOnly(brief)) {
    return [
      evidenceRule(),
      firecrawlContactAsk(),
      `Supplier: ${brief.supplierName} (${brief.originCountry}).`,
      country
        ? `This company was retrieved as a candidate for ${country}.`
        : `Target markets: ${brief.markets}.`,
      "Judge the crawled pages only against this prompt:",
      brief.instructions?.trim() ?? "",
    ].join("\n")
  }
  const type = buyerType?.trim()
  return [
    evidenceRule(),
    firecrawlContactAsk(),
    `Supplier: ${brief.supplierName} (${brief.originCountry}). Products: ${brief.products}.`,
    country
      ? `This company was retrieved as a candidate for ${country}.`
      : `Target markets: ${brief.markets}.`,
    type ? `This company was searched as this buyer type: ${type}. Record whether the pages show that type.` : "",
    brief.buyerTypes ? `Buyer types in this brief: ${brief.buyerTypes}.` : "",
    brief.mustHaves ? `Look for evidence of these must-haves: ${brief.mustHaves}.` : "",
    brief.exclusions ? `Note if the page matches an exclusion: ${brief.exclusions}.` : "",
    brief.certifications
      ? `Certifications that matter to the supplier: ${brief.certifications}.`
      : "",
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

export function exaSystemPrompt(brief?: Brief): string {
  return [
    evidenceRule(),
    "You are in search mode.",
    `Return at most ${LEADS_PER_COUNTRY} real companies of the single buyer type named in the query.`,
    "Every company must be in the one country named in the query. Omit a company from any other country.",
    "Return buyers for the supplier named in the query. Do not return that supplier, and do not return a different supplier.",
    "Each company needs its official website.",
    exaBuyerSignalAsk(brief),
    "Do not score the companies, do not write a market report, and do not invent email addresses or phone numbers.",
    "Skip the supplier’s own website. Prefer a company site over a social profile.",
  ]
    .filter(Boolean)
    .join(" ")
}

export function openaiInstructions(brief: Brief, also?: Brief): string {
  if (brief.searchKind === "competitors" && !also) {
    return [
      evidenceRule(),
      "You classify distributor leads. Use only the evidence in the candidate cards. Do not browse and do not invent brands or countries.",
      `Brand: ${brief.supplierName}, from ${brief.originCountry}.`,
      brief.excludedMarkets ? `Excluded countries: ${brief.excludedMarkets}.` : "",
      "A high score means the company distributes this brand, or it is a direct competitor distributor of a rival brand in the same country. Low means a retailer, a salon, or an unrelated company.",
      "Set best_fit to the brand name when they distribute it, direct competitor when they import a rival, or neither.",
      cardAsk("a brand"),
      buyingAsk(),
      brief.instructions?.trim() ?? "",
      "qualification_needed is what a salesperson still has to confirm. icp is not the purchase probability.",
      marketAsk(),
      anchorsFor(brief),
    ]
      .filter(Boolean)
      .join("\n")
  }
  if (isPromptOnly(brief) && !also) {
    return [
      evidenceRule(),
      "You score export leads. Use only the evidence in the candidate cards. Do not browse and do not invent contacts, volumes, or brands.",
      `Supplier: ${brief.supplierName}, from ${brief.originCountry}.`,
      brief.website ? `Do not treat ${brief.website} as a buyer.` : "",
      "Score against the prompt below. Do not add must-haves or exclusions that the prompt does not state.",
      brief.instructions?.trim() ?? "",
      "For every candidate set icp and each supplier fit to high, medium, or low. Set best_fit to the supplier to pursue, both, or neither.",
      cardAsk("a supplier"),
      buyingAsk(),
      brief.searchKind === "dump" ? dumpAsk() : "",
      "qualification_needed is what a salesperson still has to confirm. High icp means product and channel fit. It is not the purchase probability.",
      marketAsk(),
      anchorsFor(brief),
    ]
      .filter(Boolean)
      .join("\n")
  }
  const suppliers = also
    ? `${brief.supplierName} and ${also.supplierName}`
    : brief.supplierName
  return [
    evidenceRule(),
    "You score export leads. Use only the evidence in the candidate cards. Do not browse and do not invent contacts, volumes, or brands.",
    `Suppliers: ${suppliers}, from ${brief.originCountry}.`,
    `${brief.supplierName}: ${brief.products}. Buyer types: ${brief.buyerTypes || "unpublished"}. A company fits the channel when it matches any one of these types. Must-haves: ${brief.mustHaves || "none"}.`,
    also
      ? `${also.supplierName}: ${also.products}. Buyer types: ${also.buyerTypes || "unpublished"}. A company fits the channel when it matches any one of these types. Must-haves: ${also.mustHaves || "none"}.`
      : "",
    "Score the company against the buyer type it was searched as, and against the other types in the brief. Do not lower the score only because it is a wholesaler or a trading company rather than a distributor.",
    "For every candidate set icp and each supplier fit to high, medium, or low. Set best_fit to the supplier to pursue, both, or neither.",
    cardAsk("a supplier"),
    buyingAsk(),
    brief.searchKind === "dump" ? dumpAsk() : "",
    "qualification_needed is what a salesperson still has to confirm. High icp means product and channel fit. It is not the purchase probability.",
    marketAsk(),
    anchorsFor(brief),
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
      evidenceRule(),
      "You are mapping local distributors of one brand and their direct competitors. Cite URLs. Do not invent companies, countries, or brands.",
      `Brand: ${brief.supplierName}, from ${brief.originCountry}.`,
      countries.length
        ? `Look only in: ${countries.join(", ")}.`
        : `Cover ${count} countries.`,
      brief.excludedMarkets ? `Do not include: ${brief.excludedMarkets}.` : "",
      "For each country, confirm who distributes the brand and name the direct competitor distributors who import rival brands there. A retailer or a salon is not a direct competitor distributor.",
      competitorMarketRule(brief, countries),
      brief.instructions?.trim() ?? "",
      "Set icp high when the company is the brand’s distributor or a direct competitor distributor, medium when the role is likely but not proven, and low when it is unrelated. Set best_fit to the brand name, direct competitor, or neither.",
      buyingAsk(),
      "qualification_needed is what still has to be confirmed. Put rival brand names in known suppliers when a source names them. In competitors, list direct competitor distributors in the searched countries that are not already in the candidate list. country is the searched country, not the rival brand’s headquarters.",
      marketAsk(),
      anchorsFor(brief),
    ]
      .filter(Boolean)
      .join("\n")
  }
  if (isPromptOnly(brief) && !also) {
    return [
      evidenceRule(),
      "You are supporting an export salesperson. OpenAI already assigned a preliminary high, medium, or low and a best fit. Those levels are not confirmed purchasing intent. Refine them with current web sources. Cite URLs. Do not invent companies, contacts, or figures. You may change icp, each supplier fit, and best_fit when the sources disagree with the preliminary score, and say what changed.",
      `Supplier to place: ${brief.supplierName}, from ${brief.originCountry}.`,
      brief.website ? `Website to exclude as a buyer: ${brief.website}.` : "",
      countries.length
        ? `Write the outlook for ${countries.join(", ")}. The shortlist has up to ${LEADS_PER_COUNTRY} candidates per country.`
        : `Target markets: ${brief.markets || "unpublished"}.`,
      "Refine the score against this prompt only. Do not add must-haves or exclusions that the prompt does not state.",
      brief.instructions?.trim() ?? "",
      "Separate product fit from willingness and authority to buy. Name a competitor brand only when a source names it. Do not treat an employee count as distribution capacity. If you cite a number, include the year and the source. If a company is owned by or exclusive to a brand group, say so and do not treat it as an independent distributor.",
      cardAsk("a supplier", true),
      buyingAsk(),
      brief.searchKind === "dump" ? dumpAsk() : "",
      "Say who to approach first, the public outreach route when one is published, and a specific opening offer. For every candidate set icp and the supplier fit to high, medium, or low. Set best_fit to the supplier to pursue or neither. qualification_needed is what a salesperson still has to confirm. Rank only within this list. icp is not the purchase probability.",
      marketAsk(),
      anchorsFor(brief),
      competitorMarketRule(brief, countries),
      "Return the category outlook in the target countries, how buyers purchase, import signals, up to five competitor suppliers that already sell in those search countries (not the candidates, and not factories that only sell in the origin country), and for each candidate a fit note, known current suppliers if published, risks, and citation URLs. If a candidate is not a buyer, say so in risks.",
    ]
      .filter(Boolean)
      .join("\n")
  }
  const suppliers = also
    ? `${brief.supplierName} and ${also.supplierName}`
    : brief.supplierName
  return [
    evidenceRule(),
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
    cardAsk("a supplier", true),
    buyingAsk(),
    brief.searchKind === "dump" ? dumpAsk() : "",
    "Say who to approach first for each supplier, the public outreach route when one is published, and a specific opening offer. For every candidate set icp and each supplier fit to high, medium, or low. Set best_fit to the supplier to pursue, both, or neither. qualification_needed is what a salesperson still has to confirm. Rank only within this list. icp is not the purchase probability.",
    marketAsk(),
    anchorsFor(brief),
    competitorMarketRule(brief, countries),
    "Return the category outlook in the target countries, how buyers purchase, import signals, up to five competitor suppliers that already sell in those search countries (not the candidates, and not factories that only sell in the origin country), and for each candidate a fit note, known current suppliers if published, risks, and citation URLs. If a candidate is not a buyer, say so in risks.",
  ]
    .filter(Boolean)
    .join("\n")
}

function competitorMarketRule(brief: Brief, countries: string[]): string {
  const markets = countries.length ? countries.join(", ") : "the search countries"
  const origin = brief.originCountry.trim() || "the supplier origin country"
  return [
    `Competitors must already sell this category in ${markets}.`,
    `Do not list factories, exporters, or brands that only sell in ${origin}.`,
    "For each competitor, country is the search market where they sell, never headquarters.",
    `A brand from ${origin} belongs on the list only when a source shows it selling in a search country, and then country is that search country.`,
  ].join(" ")
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
        extraction?.keyPerson
          ? `key person ${extraction.keyPerson}${extraction.keyPersonRole ? ` (${extraction.keyPersonRole})` : ""}`
          : "",
        extraction?.email ? `email ${extraction.email}` : "",
        extraction?.phone ? `phone ${extraction.phone}` : "",
        extraction?.whatsapp ? `whatsapp ${extraction.whatsapp}` : "",
        extraction?.latestHires?.length ? `latest hires ${extraction.latestHires.slice(0, 3).join("; ")}` : "",
        lead.openai
          ? `OpenAI preliminary: ${lead.openai.icp}, best fit ${lead.openai.bestFit}. ${clip(lead.openai.rationale, 180)}`
          : "OpenAI preliminary: unscored.",
        activityLine(lead),
        buyingEvidenceLine(lead),
        ragLine(lead),
        fitProbabilityLine(lead.fit ?? computeFitProbability(brief, lead)),
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

export function diligenceInstructions(brief: Brief, brand: string): string {
  const kind = brand.toLowerCase().includes("kanechom")
    ? "Kanechom is mass-market retail hair care. Grocery, drugstore, and low-end wholesale are the channel. Skala or a similar mass brand is a positive portfolio signal. A salon-only account is a conflict."
    : brand.toLowerCase().includes("lq")
      ? "LQ Professional is salon hair care, including straightening. The buyer must reach salons and be able to train hairdressers. A grocery-only Skala book is a conflict."
      : `${brand} is the supplier being placed. Judge channel and portfolio only against this brief: ${brief.products}.`
  return [
    evidenceRule(),
    "You write a commercial due diligence note for one company and one brand. Use only the dossier and complementary-search notes. Do not invent contacts, imports, volumes, exclusivities, or intent to buy.",
    kind,
    "Do not return an opportunity score or a confidence level. The desk calculates those from the facts.",
    "Separate facts, indications, interpretations, and items that still need a human. If a search found nothing, that is absence, not proof of the opposite.",
    "Not finding an import record does not mean the company does not import.",
    "priority of pursue, if you mention it, would only mean a salesperson should approach — never a confirmed purchase.",
    "Quote URLs already in the dossier. Leave a field empty when unpublished.",
  ].join(" ")
}

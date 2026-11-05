import { activityLine } from "./activity"
import {
  anchorPromptMarkdown,
  briefUsesAnchorDistributors,
  firecrawlAnchorLine,
} from "./anchors"
import { buyingEvidenceLine, computeFitProbability, fitProbabilityLine } from "./fit-probability"
import { ragLine } from "./rag"
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

function openaiEvidenceSection(brief: Brief, also?: Brief): string {
  const sites = [brief.website, also?.website].filter(Boolean)
  return [
    "### MANDATORY EVIDENCE RULES (STRICT COMPLIANCE)",
    "EVIDENCE RULE (mandatory): Never invent.",
    "",
    "1. **Zero hallucination:** Use ONLY published evidence from candidate cards, cited URLs, page extracts, and the RAG line.",
    "2. **Missing data:** If a contact, volume, brand in the book, last purchase, stock level, sales figure, exclusivity, import, employee count, or intent to buy is not in that evidence, leave it empty or write `unpublished`.",
    "3. **Strict constraints:**",
    "   - NEVER fill gaps from training memory, typical distributors, similar countries, or what a company like this would usually do.",
    "   - Absence of proof is NOT proof of absence.",
    "   - RAG similarity is a past dashboard profile, never a Kanechom or LQ purchase. A RAG neighbor is a DIFFERENT company — NEVER copy its contacts, brands, or purchases onto this lead.",
    "   - Hiring, social posts, and ICP fit are not purchase intent.",
    "   - Do not invent a last purchase, a stock level, a sales figure, or a response rate.",
    sites.length ? `   - Do NOT treat ${sites.join(" or ")} as a buyer.` : "",
    "   - Do NOT add must-haves or exclusions that this prompt does not state.",
  ]
    .filter((line) => line !== "")
    .join("\n")
}

function openaiScopeSection(brief: Brief, also: Brief | undefined, kind: "buyers" | "prompt" | "competitors" | "dump"): string {
  const countries = targetCountries(brief)
  const markets = countries.length ? countries.join(", ") : brief.markets || "unpublished"
  const suppliers = also ? `${brief.supplierName} and ${also.supplierName}` : brief.supplierName
  const lines = [
    "### TARGET SEARCH CRITERIA & MARKET SCOPE",
    `- **Supplier(s):** ${suppliers}, from ${brief.originCountry || "unpublished"}.`,
    `- **Target location:** ${markets}.`,
  ]
  if (kind === "competitors") {
    lines.push(
      `- **Brand to map:** ${brief.supplierName}.`,
      brief.excludedMarkets ? `- **Excluded countries:** ${brief.excludedMarkets}.` : "",
      "- **Target profile:** the brand’s distributor in each country, plus direct competitor distributors of rival brands in that same country. A retailer or a salon is not a direct competitor distributor."
    )
  } else if (kind === "prompt") {
    lines.push(
      "- **Score against the search prompt in `<search_prompt>` only.** Do not add must-haves or exclusions that the prompt does not state.",
      "- **Required metadata:** key contact (email & WhatsApp), latest hires, published brands, launches, and web mentions — only when the card states them."
    )
  } else {
    lines.push(
      `- **${brief.supplierName} products:** ${brief.products || "unpublished"}.`,
      `- **Buyer types:** ${brief.buyerTypes || "unpublished"}. A company fits the channel when it matches any one of these types. Do not lower the score only because it is a wholesaler or a trading company rather than a distributor.`,
      `- **Must-haves:** ${brief.mustHaves || "none"}.`,
      `- **Exclusions:** ${brief.exclusions || "none stated"}.`,
      `- **Certifications:** ${brief.certifications || "unpublished"}.`
    )
    if (also) {
      lines.push(
        `- **${also.supplierName} products:** ${also.products || "unpublished"}.`,
        `- **${also.supplierName} buyer types:** ${also.buyerTypes || "unpublished"}. A company fits the channel when it matches any one of these types.`,
        `- **${also.supplierName} must-haves:** ${also.mustHaves || "none"}.`
      )
    }
    lines.push(
      "- **Required metadata extraction (only if published):** key contact person (email & WhatsApp), latest brand additions, product launches, recent hirings, brands in portfolio, and web mentions."
    )
  }
  if (kind === "dump") {
    lines.push(
      "- **Dump + API:** only companies Exa and Firecrawl confirmed reach this scoring step.",
      "- HS shipments on the card are a strong importer signal — the account moves cargo — not a Kanechom or LQ purchase.",
      "- Do not copy dump volume into `last_purchase`. Do not set `best_fit` from the dump alone. Score channel fit; Parallel still refines."
    )
  }
  const extraNote = [brief.instructions?.trim(), also?.instructions?.trim()].filter(Boolean).join("\n")
  if (extraNote) {
    lines.push("", "<search_prompt>", extraNote, "</search_prompt>")
  }
  return lines.filter(Boolean).join("\n")
}

function openaiScoringSection(kind: "buyers" | "prompt" | "competitors" | "dump"): string {
  if (kind === "competitors") {
    return [
      "### SCORING SYSTEM & LOGIC RULES",
      "",
      "| Field | Values | Meaning | Hard rules |",
      "| --- | --- | --- | --- |",
      "| `icp` | `high` \\| `medium` \\| `low` | Channel fit: brand distributor or direct competitor distributor in the search country. | High ICP is not purchase intent. |",
      "| `best_fit` | brand name \\| `direct competitor` \\| `neither` | Who to pursue. | Set the brand name when they distribute it. Set `direct competitor` when they import a rival. Set `neither` if last purchase, stock, and sales are unpublished. |",
      "| `purchase_probability` | `high` \\| `medium` \\| `low` | Chance a qualified buyer in this market would take the brand on. Not a percentage. | High needs at least two published commercial facts among last purchase, stock, brand performance, sales, and a competitor move, plus recent public activity. If last purchase, stock, and sales are unpublished, use `medium` or `low`. |",
      "| `qualification_needed` | string | What a salesperson still has to confirm. | Leave empty items unpublished. |",
      "| `entry_strategy` | string | Short market-entry plan. | Name a practice only when a source supports it. Do not invent a statistic. |",
      "",
      "Hiring, social posts, brochures, and ICP fit alone must not set `best_fit`.",
    ].join("\n")
  }
  return [
    "### SCORING SYSTEM & LOGIC RULES",
    "",
    "| Field | Values | Meaning | Hard rules |",
    "| --- | --- | --- | --- |",
    "| `icp` | `high` \\| `medium` \\| `low` | Product and channel fit (anchor-like diversified hair/beauty book and salon/retail client base, or the buyer type in the brief). | High ICP is **not** purchase probability. High ICP may be assigned even if commercial figures are unpublished. |",
    "| `supplier_fits[]` | `high` \\| `medium` \\| `low` per supplier | Fit to each named supplier. | Score the buyer type the candidate was searched as, and the other types in the brief. |",
    "| `purchase_probability` | `high` \\| `medium` \\| `low` | Market likelihood a qualified buyer would take the brand on. Keep separate from ICP. Do **not** output percentages. | **High** requires at least **two** published commercial facts among last purchase/shipment, stock/restock, brand performance, sales/volume, or a competitor move, **plus** recent public activity. If last purchase, stock, and sales are unpublished, set `medium` or `low`. |",
    "| `best_fit` | supplier name \\| `both` \\| `neither` | Primary supplier to pursue from commercial evidence. | If last purchase, stock, and sales are unpublished, `best_fit` MUST be `neither`. Do not set `best_fit` from ICP, a brochure, social posts, or hiring alone. |",
    "| `qualification_needed` | string | Specific facts a salesperson still needs to confirm. | Unpublished is not a filled-in no. |",
    "| `entry_strategy` | string | Concise market-entry plan (one importer before many retailers, train that channel, non-exclusive trial, local professional-tier pricing). | Name a practice only when a source supports it. Do not invent a metric. |",
    "",
    "A company that only has a brochure is not a high commercial fit. Quote the source for last purchase, stock, brand performance, sales, and competitor moves.",
  ].join("\n")
}

export function openaiInstructions(brief: Brief, also?: Brief): string {
  const kind: "buyers" | "prompt" | "competitors" | "dump" =
    brief.searchKind === "competitors" && !also
      ? "competitors"
      : brief.searchKind === "dump"
        ? "dump"
        : isPromptOnly(brief) && !also
          ? "prompt"
          : "buyers"
  const suppliers = also ? `${brief.supplierName} and ${also.supplierName}` : brief.supplierName
  const role =
    kind === "competitors"
      ? `You are an expert Lead Scoring Analyst mapping local distributors of ${brief.supplierName} (from ${brief.originCountry}). Evaluate candidate cards based *strictly* on provided evidence. Do not browse and do not invent brands or countries.`
      : `You are an expert Lead Scoring Analyst evaluating B2B export distribution leads for ${suppliers} (from ${brief.originCountry}). Evaluate lead candidate cards based *strictly* on provided evidence and score ICP fit, purchase_probability, supplier fit, and best_fit. Do not browse.`
  const markets = targetCountries(brief).join(", ") || brief.markets || "the search country"
  return [
    "# ROLE AND TASK DEFINITION",
    role,
    "",
    "---",
    "",
    openaiEvidenceSection(brief, also),
    "",
    "---",
    "",
    openaiScopeSection(brief, also, kind),
    "",
    "---",
    "",
    briefUsesAnchorDistributors(brief) ? `${anchorPromptMarkdown(markets)}\n\n---\n` : "",
    openaiScoringSection(kind),
    "",
    "---",
    "",
    "### EVALUATION PROCESS (STEP-BY-STEP)",
    "For each candidate card in `<candidate_cards>`:",
    "1. **Analyze evidence:** candidate card, public activity line, RAG line, and fit-probability line.",
    "2. **Extract quotes:** quote exact sources for shipments, stock, brand performance, sales, or competitor moves.",
    "3. **Score metrics:** compute `icp`, `purchase_probability`, `supplier_fits`, and `best_fit` from the table above.",
    "4. **Identify gaps:** put unverified items in `qualification_needed`.",
    "",
    "---",
    "",
    "### CANDIDATE INPUT CONTEXT",
    "Candidate cards arrive in the user message inside `<candidate_cards>`. Score only those cards.",
    "",
    "```output_schema",
    '{ "leads": [{ "company": "", "icp": "high|medium|low", "rationale": "", "supplier_fits": [{ "supplier": "", "level": "high|medium|low" }], "best_fit": "", "qualification_needed": "" }], "purchase_probability": "high|medium|low", "purchase_probability_note": "", "entry_strategy": "" }',
    "```",
  ]
    .filter((block) => block !== "")
    .join("\n")
}

function parallelKind(brief: Brief, also?: Brief): "buyers" | "prompt" | "competitors" | "dump" {
  if (brief.searchKind === "competitors" && !also) return "competitors"
  if (brief.searchKind === "dump") return "dump"
  if (isPromptOnly(brief) && !also) return "prompt"
  return "buyers"
}

function parallelEvidenceSection(brief: Brief, also?: Brief): string {
  const sites = [brief.website, also?.website].filter(Boolean)
  return [
    "### MANDATORY EVIDENCE & FACT-CHECKING RULES (STRICT COMPLIANCE)",
    "EVIDENCE RULE (mandatory): Never invent.",
    "",
    "1. **Zero hallucination / fact enforcement:** Never invent companies, contact details, sales figures, or shipment histories. Use ONLY verified, publicly accessible web evidence retrieved during this research pass, plus the candidate card, cited URLs, page extracts, and the RAG line.",
    "2. **Missing data protocol:** If last purchase, stock level, sales figure, exclusivity, or employee count is NOT found during live research, mark it `unpublished` or leave it blank.",
    "3. **Absence is NOT proof of absence:** Do not assume a company does not import simply because a record was not found quickly. You still cannot award a high `best_fit` without hard published proof.",
    "4. **OpenAI scores are UNCONFIRMED ASSUMPTIONS.** OpenAI already assigned a preliminary `icp`, `supplier_fit`, and `best_fit`. Those levels are not confirmed purchasing intent. You are explicitly empowered to change them when live sources disagree, and you must say **WHAT CHANGED** and **WHY**, with the URL.",
    "5. **RAG & anchor independence:** RAG similarity and anchor profiles (Nazih, Gem, SSIZ) are past reference shapes only. NEVER copy contacts, purchases, or brands from an anchor or a RAG neighbor onto this lead.",
    "6. **Mandatory citations:** EVERY claim, metric, or status change MUST include its exact source URL. If you cite a number, include the year and the source.",
    "7. **Other constraints:**",
    "   - Hiring, social posts, and ICP fit are not purchase intent.",
    "   - Do not treat an employee count as distribution capacity.",
    "   - Name a competitor brand only when a source names it.",
    "   - If a company is owned by or exclusive to a brand group, say so and do not treat it as an independent distributor.",
    "   - Do not invent a last purchase, a stock level, a sales figure, or a response rate.",
    sites.length ? `   - Do NOT treat ${sites.join(" or ")} as a buyer.` : "",
  ]
    .filter((line) => line !== "")
    .join("\n")
}

function parallelScoringSection(kind: "buyers" | "prompt" | "competitors" | "dump"): string {
  if (kind === "competitors") {
    return [
      "### RE-EVALUATION LOGIC & SCORING OVERRIDES",
      "",
      "| Field | Values | Hard rules |",
      "| --- | --- | --- |",
      "| `icp` | `high` \\| `medium` \\| `low` | High when the company is the brand’s distributor or a direct competitor distributor. Medium when likely but not proven. Low when unrelated. High ICP is not purchase intent. |",
      "| `best_fit` | brand name \\| `direct competitor` \\| `neither` | Brand name if they distribute it. `direct competitor` if they import a rival. `neither` if last purchase, stock, and sales stay unpublished after live search. |",
      "| `purchase_probability` | `high` \\| `medium` \\| `low` | High needs two verified commercial facts plus recent public activity. Not a percentage. |",
      "",
      "Put rival brand names in known suppliers when a source names them. country is the searched country, not the rival brand’s headquarters.",
    ].join("\n")
  }
  return [
    "### RE-EVALUATION LOGIC & SCORING OVERRIDES",
    "",
    "#### 1. ICP Fit (`high` | `medium` | `low`)",
    "- Channel and product fit. Refine from live evidence of brand portfolio, client base (retail chains, salon networks), and operational scale.",
    "- Score the buyer type the candidate was searched as. A company fits the channel when it matches any one of these types. Do not lower the score only because it is a wholesaler or a trading company rather than a distributor.",
    "- High ICP alone DOES NOT justify `best_fit` or confirm purchase intent.",
    "",
    "#### 2. Supplier Fit & Best Fit (supplier name | `both` | `neither`)",
    "- **Strict override:** If live research fails to uncover at least one verified commercial fact (**last shipment/purchase**, **current stock/restock**, **published sales volume**, or **competitor brand movement**), `best_fit` MUST BE OVERRIDDEN TO `neither`.",
    "- **Invalid drivers:** Hiring ads, active social accounts, standard catalogs, or generic high ICP do NOT set `best_fit`.",
    "- **Audit trail:** If you change OpenAI’s preliminary `best_fit` or `icp`, state **WHAT CHANGED** and **WHY** (citing the web source).",
    "",
    "#### 3. Purchase Probability (`high` | `medium` | `low`)",
    "- **High:** at least **TWO** verified commercial facts (last purchase, stock, brand performance, sales figures, competitor move) **plus** recent public activity (past 6 months).",
    "- **Medium / Low:** default if commercial data remains `unpublished` after live search. Do not output percentages.",
  ].join("\n")
}

export function parallelInstructions(brief: Brief, also?: Brief): string {
  const kind = parallelKind(brief, also)
  const countries = targetCountries(brief)
  const suppliers = also ? `${brief.supplierName} and ${also.supplierName}` : brief.supplierName
  const markets = countries.length ? countries.join(", ") : brief.markets || "unpublished"
  const count = brief.countryCount && brief.countryCount > 0 ? brief.countryCount : 5
  const role =
    kind === "competitors"
      ? `You are an Autonomous Deep Research & Lead Verification Agent mapping local distributors of ${brief.supplierName} (from ${brief.originCountry}) and their direct competitors. Cite URLs. Do not invent companies, countries, or brands.`
      : `You are an Autonomous Deep Research & Lead Verification Agent supporting an international B2B export sales pipeline for ${suppliers} (from ${brief.originCountry}). Your mission is to perform live web research to stress-test, refine, or override the preliminary scores (\`icp\`, \`supplier_fit\`, \`best_fit\`) assigned by OpenAI for each distribution lead.`
  const outlook =
    kind === "competitors"
      ? countries.length
        ? `Look only in: ${markets}.`
        : `Cover ${count} countries.`
      : countries.length
        ? `Write the outlook separately for each target country: ${markets}. The shortlist has up to ${LEADS_PER_COUNTRY} candidates per country.`
        : `Target markets: ${markets}.`
  return [
    "# ROLE & DEEP RESEARCH MISSION",
    role,
    "",
    "---",
    "",
    parallelEvidenceSection(brief, also),
    "",
    "---",
    "",
    openaiScopeSection(brief, also, kind),
    `- **Outlook:** ${outlook}`,
    kind === "competitors" && brief.excludedMarkets ? `- **Do not include:** ${brief.excludedMarkets}.` : "",
    "",
    "---",
    "",
    briefUsesAnchorDistributors(brief) ? `${anchorPromptMarkdown(markets)}\n\n---\n` : "",
    parallelScoringSection(kind),
    "",
    "---",
    "",
    "### DEEP RESEARCH EXECUTION WORKFLOW",
    "For each candidate card in `<candidate_cards>`:",
    "1. **Source verification:** Search current web sources, trade databases, company sites, and news for the candidate’s exact corporate name. Use the public activity line, the RAG line, and the fit-probability line on the card.",
    "2. **Commercial audit:** Search for recent imports, brand additions, active retail/salon placements, product launches, last purchase or shipment, stock or restock, brand performance, published sales, and competitor moves. Quote the source.",
    "3. **Score stress-test:** Compare preliminary OpenAI scores against live findings. Identify conflicts or missing proof.",
    "4. **Output generation:** Deliver a decision-ready report with updated `icp`, `supplier_fits`, `best_fit`, `purchase_probability`, source URLs, `qualification_needed`, who to approach first, the public outreach route when published, a specific opening offer, and `entry_strategy`. Rank only within this list.",
    "5. **Market extras:** category outlook in the target countries, how buyers purchase, import signals, up to five competitor suppliers that already sell in those search countries (not the candidates, and not factories that only sell in the origin country). If a candidate is not a buyer, say so in risks.",
    "",
    "---",
    "",
    "### MARKET COMPETITORS (NOT THE CANDIDATE LIST)",
    competitorMarketRule(brief, countries),
    "",
    "---",
    "",
    "### INPUT DATA FOR RESEARCH",
    "Cards arrive in a fenced `input_data` block with `<candidate_cards>` and OpenAI’s preliminary scores. Research only those companies.",
  ]
    .filter((block) => block !== "")
    .join("\n")
}

function competitorMarketRule(brief: Brief, countries: string[]): string {
  const markets = countries.length ? countries.join(", ") : "the search countries"
  const origin = brief.originCountry.trim() || "the supplier origin country"
  return [
    `- Competitors must already sell this category in ${markets}.`,
    `- Do not list factories, exporters, or brands that only sell in ${origin}.`,
    "- For each competitor, country is the search market where they sell, never headquarters.",
    `- A brand from ${origin} belongs on the list only when a source shows it selling in a search country, and then country is that search country.`,
  ].join("\n")
}

export function researchPrompt(brief: Brief, leads: Lead[], also?: Brief): string {
  const suppliers = also ? `${brief.supplierName} and ${also.supplierName}` : brief.supplierName
  const cards = leads
    .map((lead, index) => {
      const extraction = lead.extraction
      const lines = [
        `<candidate index="${index + 1}">`,
        `- **Name:** ${lead.name}`,
        lead.market ? `- **Market:** searched for ${lead.market}` : "",
        lead.buyerType ? `- **Buyer type:** searched as ${lead.buyerType}` : "",
        `- **URL:** ${lead.url}`,
        `- **Country:** ${extraction?.country || lead.country || "unpublished"}`,
        extraction?.role ? `- **Role:** ${extraction.role}` : "",
        extraction?.buys?.length ? `- **Buys:** ${extraction.buys.slice(0, 4).join("; ")}` : "",
        extraction?.keyPerson
          ? `- **Key person:** ${extraction.keyPerson}${extraction.keyPersonRole ? ` (${extraction.keyPersonRole})` : ""}`
          : "",
        extraction?.email ? `- **Email:** ${extraction.email}` : "",
        extraction?.phone ? `- **Phone:** ${extraction.phone}` : "",
        extraction?.whatsapp ? `- **WhatsApp:** ${extraction.whatsapp}` : "",
        extraction?.latestHires?.length ? `- **Latest hires:** ${extraction.latestHires.slice(0, 3).join("; ")}` : "",
        lead.openai
          ? `- **OpenAI preliminary:** icp ${lead.openai.icp}; best_fit ${lead.openai.bestFit}. ${clip(lead.openai.rationale, 180)}`
          : "- **OpenAI preliminary:** unscored.",
        activityLine(lead) ? `- **Activity:** ${activityLine(lead)}` : "",
        buyingEvidenceLine(lead) ? `- **Buying evidence:** ${buyingEvidenceLine(lead)}` : "",
        ragLine(lead) ? `- **RAG:** ${ragLine(lead)}` : "",
        `- **Fit-probability:** ${fitProbabilityLine(lead.fit ?? computeFitProbability(brief, lead))}`,
        `- **Excerpt:** ${clip(extraction?.summary || lead.exa.summary || lead.exa.text, 180)}`,
        `</candidate>`,
      ]
      return lines.filter(Boolean).join("\n")
    })
    .join("\n")
  const instructions = parallelInstructions(brief, also)
  const payload = [
    "```input_data",
    `Suppliers to place: ${suppliers}, from ${brief.originCountry}.`,
    "PRELIMINARY CANDIDATE CARDS & OPENAI SCORES:",
    "<candidate_cards>",
    cards,
    "</candidate_cards>",
    "```",
  ].join("\n")
  const header = `${instructions}\n\n`
  const room = Math.max(0, 20000 - header.length)
  return `${header}${payload.slice(0, room)}`
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

import { LEADS_PER_COUNTRY } from "./prompts"
import type { Brief } from "./types"

export const EXAMPLE_BRIEF: Brief = {
  supplierName: "Serra Alta Exportadora",
  originCountry: "Brazil",
  website: "https://serraalta.example",
  products:
    "green specialty arabica, 84+ SCA microlots, natural and pulped natural process",
  differentiators:
    "Farm-level lots from Mantiqueira de Minas, EUDR-ready lot traceability, container and microlot programs from the same harvest",
  certifications: "organic, Rainforest Alliance, BSCA",
  markets: "Germany, Netherlands, Japan",
  buyerTypes: "specialty importers, green coffee distributors, roasters that import",
  mustHaves: "imports or distributes green coffee",
  exclusions: "instant coffee, equipment manufacturers, cafes with no wholesale",
  leadCount: LEADS_PER_COUNTRY,
}

export const HAIR_MARKETS = "Dominican Republic, South Africa, Chile"

export const KANECHOM_BRIEF: Brief = {
  supplierName: "Kanechom",
  originCountry: "Brazil",
  website: "https://kanechom.com",
  products: "mass-market retail hair care: shampoo, conditioner, treatments, and styling",
  differentiators:
    "Brazilian hair care for mass-market and low-end retail. Skala is a major competitor, so a distributor that already carries Skala or a similar brand is a strong lead.",
  certifications: "GMP, ANVISA",
  markets: HAIR_MARKETS,
  buyerTypes: "mass-market distributor, wholesaler, trading company",
  mustHaves:
    "imports retail hair care, coverage in mass-market and low-end retail, experience importing an international brand",
  exclusions: "salons with no wholesale, equipment-only suppliers",
  instructions:
    "A strong signal is a distributor of competitor hair-care brands, especially Skala.",
  leadCount: LEADS_PER_COUNTRY,
}

export const LQ_BRIEF: Brief = {
  supplierName: "LQ Professional",
  originCountry: "Brazil",
  website: "https://lqprofessional.com.br",
  products: "professional hair care for beauty salons, including straightening sets",
  differentiators:
    "Brazilian professional hair care for beauty salons, including straightening sets. The buyer should be able to train hairdressers.",
  certifications: "GMP, ANVISA",
  markets: HAIR_MARKETS,
  buyerTypes: "distributor, wholesaler, trading company",
  mustHaves:
    "distributes professional salon hair care, capacity to train hairdressers, experience importing an international brand",
  exclusions: "salons with no wholesale, equipment-only suppliers",
  instructions:
    "Look for distributors of professional salon brands and straightening systems, not mass-market grocery hair care.",
  leadCount: LEADS_PER_COUNTRY,
}

export function emptyBrief(): Brief {
  return {
    supplierName: "",
    originCountry: "",
    website: "",
    products: "",
    differentiators: "",
    certifications: "",
    markets: "",
    buyerTypes: "",
    mustHaves: "",
    exclusions: "",
    instructions: "",
    leadCount: LEADS_PER_COUNTRY,
  }
}

export function validateBrief(input: unknown): { brief?: Brief; error?: string } {
  if (!input || typeof input !== "object") {
    return { error: "The brief was empty." }
  }
  const raw = input as Partial<Brief>
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
  const brief: Brief = {
    supplierName: text(raw.supplierName),
    originCountry: text(raw.originCountry),
    website: text(raw.website),
    products: text(raw.products),
    differentiators: text(raw.differentiators),
    certifications: text(raw.certifications),
    markets: text(raw.markets),
    buyerTypes: text(raw.buyerTypes),
    mustHaves: text(raw.mustHaves),
    exclusions: text(raw.exclusions),
    instructions: text(raw.instructions).slice(0, 800),
    leadCount: LEADS_PER_COUNTRY,
  }
  if (!brief.supplierName) return { error: "Name the supplier you are representing." }
  if (!brief.originCountry) return { error: "Add the supplier’s origin country." }
  if (!brief.products) return { error: "Describe the products this supplier exports." }
  if (!brief.markets) return { error: "Add at least one target market." }
  if (!brief.buyerTypes) return { error: "Describe the buyer types you want." }
  if (brief.website && !/^https?:\/\//i.test(brief.website)) {
    brief.website = `https://${brief.website}`
  }
  return { brief }
}

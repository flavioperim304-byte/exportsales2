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
  leadCount: 5,
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
    leadCount: 6,
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
    leadCount: Number(raw.leadCount),
  }
  if (!brief.supplierName) return { error: "Name the supplier you are representing." }
  if (!brief.originCountry) return { error: "Add the supplier’s origin country." }
  if (!brief.products) return { error: "Describe the products this supplier exports." }
  if (!brief.markets) return { error: "Add at least one target market." }
  if (!brief.buyerTypes) return { error: "Describe the buyer types you want." }
  if (!Number.isFinite(brief.leadCount)) brief.leadCount = 6
  brief.leadCount = Math.min(8, Math.max(4, Math.round(brief.leadCount)))
  if (brief.website && !/^https?:\/\//i.test(brief.website)) {
    brief.website = `https://${brief.website}`
  }
  return { brief }
}

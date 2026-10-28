import type { Brief, FitJudgment, Lead } from "./types"
import { ApiError, requestJson } from "./http"
import { openaiInstructions } from "./prompts"
import { asString, clip } from "./text"

export type OpenAIJudgment = FitJudgment & { company: string }

export type OpenAIEntry = {
  purchaseProbability: "high" | "medium" | "low" | ""
  purchaseNote: string
  strategy: string
}

const MODELS = ["gpt-4.1-mini", "gpt-4o-mini"]

function levelOf(value: unknown): "high" | "medium" | "low" | undefined {
  const text = asString(value).toLowerCase()
  if (text === "high" || text === "medium" || text === "low") return text
  return undefined
}

function fits(value: unknown): FitJudgment["supplierFits"] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>
      const level = levelOf(row.level)
      const supplier = asString(row.supplier)
      if (!supplier || !level) return null
      return { supplier, level }
    })
    .filter((item): item is FitJudgment["supplierFits"][number] => Boolean(item))
}

export function judgmentsFromOpenAI(data: unknown): OpenAIJudgment[] {
  const content = (() => {
    if (!data || typeof data !== "object") return ""
    const choice = (data as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]
    const raw = choice?.message?.content
    return typeof raw === "string" ? raw : ""
  })()
  if (!content.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  const leads = (parsed as { leads?: unknown } | null)?.leads
  if (!Array.isArray(leads)) return []
  return leads
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>
      const icp = levelOf(row.icp)
      const company = asString(row.company)
      if (!company || !icp) return null
      return {
        company,
        icp,
        supplierFits: fits(row.supplier_fits),
        bestFit: asString(row.best_fit) || "neither",
        qualificationNeeded: asString(row.qualification_needed),
        rationale: asString(row.rationale),
      }
    })
    .filter((item): item is OpenAIJudgment => Boolean(item))
}

export function entryFromOpenAI(data: unknown): OpenAIEntry {
  const empty: OpenAIEntry = { purchaseProbability: "", purchaseNote: "", strategy: "" }
  const content = (() => {
    if (!data || typeof data !== "object") return ""
    const choice = (data as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]
    const raw = choice?.message?.content
    return typeof raw === "string" ? raw : ""
  })()
  if (!content.trim()) return empty
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      purchaseProbability: levelOf(parsed.purchase_probability) ?? "",
      purchaseNote: asString(parsed.purchase_probability_note),
      strategy: asString(parsed.entry_strategy),
    }
  } catch {
    return empty
  }
}

function schema(suppliers: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      leads: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            company: { type: "string" },
            icp: { type: "string", enum: ["high", "medium", "low"] },
            rationale: { type: "string" },
            supplier_fits: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  supplier: { type: "string", enum: suppliers },
                  level: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: ["supplier", "level"],
              },
            },
            best_fit: { type: "string" },
            qualification_needed: { type: "string" },
          },
          required: [
            "company",
            "icp",
            "rationale",
            "supplier_fits",
            "best_fit",
            "qualification_needed",
          ],
        },
      },
      purchase_probability: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Chance a qualified buyer in this search market would take the brand on. Not a percentage.",
      },
      purchase_probability_note: { type: "string" },
      entry_strategy: {
        type: "string",
        description: "How to enter this market, from practices that have worked for professional brands.",
      },
    },
    required: ["leads", "purchase_probability", "purchase_probability_note", "entry_strategy"],
  }
}

function cards(leads: Lead[]): string {
  return leads
    .map((lead, index) => {
      const extraction = lead.extraction
      return [
        `${index + 1}. ${lead.name}`,
        lead.market ? `searched for ${lead.market}` : "",
        lead.buyerType ? `searched as ${lead.buyerType}` : "",
        lead.url,
        extraction?.role,
        extraction?.country || lead.country,
        extraction?.email ? `email ${extraction.email}` : "",
        extraction?.phone ? `phone ${extraction.phone}` : "",
        extraction?.whatsapp ? `whatsapp ${extraction.whatsapp}` : "",
        extraction?.buys?.slice(0, 4).join("; "),
        clip(extraction?.summary || lead.exa.summary || lead.exa.text, 320),
      ]
        .filter(Boolean)
        .join(" — ")
    })
    .join("\n")
}

export async function scoreLeads(
  brief: Brief,
  leads: Lead[],
  key: string,
  also?: Brief
): Promise<{ leads: OpenAIJudgment[]; entry: OpenAIEntry }> {
  const suppliers = [brief.supplierName, also?.supplierName].filter((name): name is string =>
    Boolean(name)
  )
  const body = {
    messages: [
      { role: "system", content: openaiInstructions(brief, also) },
      { role: "user", content: `Candidates:\n${cards(leads)}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "lead_scores", strict: true, schema: schema(suppliers) },
    },
  }
  let lastError: unknown
  for (const model of MODELS) {
    try {
      const data = await requestJson("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        timeoutMs: 90000,
        headers: { Authorization: `Bearer ${key}` },
        body: JSON.stringify({ ...body, model }),
      })
      return { leads: judgmentsFromOpenAI(data), entry: entryFromOpenAI(data) }
    } catch (error) {
      lastError = error
      if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 404)) {
        throw error
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI rejected the score.")
}

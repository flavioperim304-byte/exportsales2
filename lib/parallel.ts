import type { Brief, Competitor, Lead, MarketContext } from "./types"
import { ApiError, requestJson } from "./http"
import { researchPrompt } from "./prompts"
import { asString, asStringArray } from "./text"

export { researchPrompt }

export type ParsedResearch = {
  market: MarketContext
  competitors: Competitor[]
  leads: {
    company: string
    fitNarrative: string
    knownSuppliers: string[]
    risks: string[]
    citations: string[]
  }[]
}

const OUTPUT_SCHEMA = {
  type: "json",
  json_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      outlook: {
        type: "string",
        description: "Market outlook for the supplier products in the target markets. Include figures only when a source states them.",
      },
      buyer_dynamics: {
        type: "string",
        description: "How buyers in these markets actually purchase this category.",
      },
      import_signals: { type: "array", items: { type: "string" } },
      market_citations: { type: "array", items: { type: "string" } },
      competitors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            country: { type: "string" },
            why_relevant: { type: "string" },
            url: { type: "string" },
          },
          required: ["name", "country", "why_relevant", "url"],
        },
      },
      leads: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            company: { type: "string" },
            fit_narrative: { type: "string" },
            known_suppliers: { type: "array", items: { type: "string" } },
            risks: { type: "array", items: { type: "string" } },
            citations: { type: "array", items: { type: "string" } },
          },
          required: ["company", "fit_narrative", "known_suppliers", "risks", "citations"],
        },
      },
    },
    required: [
      "outlook",
      "buyer_dynamics",
      "import_signals",
      "market_citations",
      "competitors",
      "leads",
    ],
  },
}

export async function createResearch(
  brief: Brief,
  leads: Lead[],
  key: string
): Promise<{ runId: string; interactionId?: string; processor: string }> {
  const input = researchPrompt(brief, leads)
  const processors = ["pro-fast", "pro"]
  let lastError: unknown
  for (const processor of processors) {
    try {
      const data = await requestJson("https://api.parallel.ai/v1/tasks/runs", {
        method: "POST",
        timeoutMs: 40000,
        headers: { "x-api-key": key },
        body: JSON.stringify({
          input,
          processor,
          task_spec: { output_schema: OUTPUT_SCHEMA },
        }),
      })
      const record = (data ?? {}) as { run_id?: string; interaction_id?: string }
      if (!record.run_id) {
        throw new ApiError("Parallel did not return a run id.", 502)
      }
      return {
        runId: record.run_id,
        interactionId: record.interaction_id,
        processor,
      }
    } catch (error) {
      lastError = error
      if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 422)) {
        throw error
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Parallel rejected the research task.")
}

export async function researchStatus(
  runId: string,
  key: string
): Promise<{ status: string; error?: string }> {
  const data = await requestJson(`https://api.parallel.ai/v1/tasks/runs/${runId}`, {
    method: "GET",
    timeoutMs: 20000,
    headers: { "x-api-key": key },
  })
  const record = (data ?? {}) as { status?: string; error?: unknown; run?: { status?: string } }
  const status = record.status || record.run?.status || "unknown"
  const error =
    typeof record.error === "string"
      ? record.error
      : record.error
        ? JSON.stringify(record.error).slice(0, 300)
        : undefined
  return { status, error }
}

function basisUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const urls: string[] = []
  for (const field of value) {
    if (!field || typeof field !== "object") continue
    const citations = (field as { citations?: unknown }).citations
    if (!Array.isArray(citations)) continue
    for (const citation of citations) {
      if (citation && typeof citation === "object" && typeof (citation as { url?: unknown }).url === "string") {
        urls.push((citation as { url: string }).url)
      }
    }
  }
  return urls
}

export function parseResearch(data: unknown): ParsedResearch | null {
  if (!data || typeof data !== "object") return null
  const root = data as { output?: { content?: unknown; basis?: unknown }; content?: unknown }
  const output = root.output
  const content = output?.content ?? root.content
  const citations = basisUrls(output?.basis)

  if (typeof content === "string" && content.trim()) {
    return {
      market: {
        outlook: content.trim(),
        buyerDynamics: "",
        importSignals: [],
        citations,
      },
      competitors: [],
      leads: [],
    }
  }
  if (!content || typeof content !== "object") return null
  const record = content as Record<string, unknown>
  const competitors = Array.isArray(record.competitors) ? record.competitors : []
  const leads = Array.isArray(record.leads) ? record.leads : []
  const marketCitations = [...asStringArray(record.market_citations), ...citations]
  return {
    market: {
      outlook: asString(record.outlook),
      buyerDynamics: asString(record.buyer_dynamics),
      importSignals: asStringArray(record.import_signals).slice(0, 8),
      citations: [...new Set(marketCitations)].slice(0, 12),
    },
    competitors: competitors
      .map((item) => {
        const row = (item ?? {}) as Record<string, unknown>
        return {
          name: asString(row.name),
          country: asString(row.country),
          whyRelevant: asString(row.why_relevant),
          url: asString(row.url),
        }
      })
      .filter((item) => item.name)
      .slice(0, 6),
    leads: leads
      .map((item) => {
        const row = (item ?? {}) as Record<string, unknown>
        return {
          company: asString(row.company),
          fitNarrative: asString(row.fit_narrative),
          knownSuppliers: asStringArray(row.known_suppliers).slice(0, 6),
          risks: asStringArray(row.risks).slice(0, 6),
          citations: asStringArray(row.citations).slice(0, 6),
        }
      })
      .filter((item) => item.company),
  }
}

export async function researchResult(runId: string, key: string): Promise<ParsedResearch | null> {
  const data = await requestJson(`https://api.parallel.ai/v1/tasks/runs/${runId}/result`, {
    method: "GET",
    timeoutMs: 30000,
    headers: { "x-api-key": key },
  })
  return parseResearch(data)
}

export function namesMatch(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  const a = normalize(left)
  const b = normalize(right)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

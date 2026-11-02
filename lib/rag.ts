import type { Lead, RagMatch } from "./types"

const timeoutMs = 12000

function ragUrl(): string {
  return (process.env.RAG_API_URL || "").trim().replace(/\/$/, "")
}

export function ragConfigured(): boolean {
  return Boolean(ragUrl())
}

function blob(lead: Lead): { company: string; country: string; role: string; summary: string } {
  return {
    company: lead.name,
    country: lead.market || lead.extraction?.country || lead.country || "",
    role: lead.extraction?.role || lead.buyerType || "",
    summary: [lead.extraction?.summary, lead.exa.summary, lead.exa.text].filter(Boolean).join(" ").slice(0, 800),
  }
}

export async function matchLead(lead: Lead): Promise<RagMatch> {
  const base = ragUrl()
  if (!base) {
    return { checked: false, match: false, note: "RAG API is not configured." }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base}/api/v1/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blob(lead)),
      signal: controller.signal,
    })
    const data = (await response.json().catch(() => null)) as {
      match?: boolean
      exact?: boolean
      distance?: number
      neighbor?: string
      note?: string
      detail?: string
    } | null
    if (!response.ok || !data) {
      return {
        checked: true,
        match: false,
        note: data?.detail || data?.note || `RAG returned ${response.status}.`,
      }
    }
    return {
      checked: true,
      match: Boolean(data.match),
      exact: Boolean(data.exact),
      distance: typeof data.distance === "number" ? data.distance : undefined,
      neighbor: data.neighbor || "",
      note: data.note || (data.match ? "Matches the Chroma index." : "Does not match the Chroma index."),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAG request failed."
    return { checked: true, match: false, note: message }
  } finally {
    clearTimeout(timer)
  }
}

export async function matchLeads(leads: Lead[]): Promise<Map<string, RagMatch>> {
  const out = new Map<string, RagMatch>()
  if (!ragConfigured()) return out
  const rows = await Promise.all(leads.map(async (lead) => [lead.id, await matchLead(lead)] as const))
  for (const [id, rag] of rows) out.set(id, rag)
  return out
}

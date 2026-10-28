import { searchLeads } from "./exa"
import { extractPage } from "./firecrawl"
import { publicError } from "./http"
import { getKeys } from "./keys"
import {
  createResearch,
  namesMatch,
  researchResult,
  researchStatus,
} from "./parallel"
import { compareLeads, scoreLead } from "./score"
import { getRun, insertRun, updateRun } from "./store"
import type { Brief, Lead, LogLine, Run, StageId, StageState } from "./types"
import { SAMPLE_RUN_ID } from "./ids"

const running = new Set<string>()
const RESEARCH_BUDGET_MS = 8 * 60 * 1000

function now(): string {
  return new Date().toISOString()
}

function stage(run: Run, id: StageId): StageState {
  const found = run.stages.find((item) => item.id === id)
  if (!found) throw new Error(`Missing stage ${id}`)
  return found
}

function log(run: Run, stageId: LogLine["stage"], message: string) {
  run.logs.push({ at: now(), stage: stageId, message })
  if (run.logs.length > 80) run.logs.splice(0, run.logs.length - 80)
}

function secrets(): string[] {
  const keys = getKeys()
  return [keys.exa, keys.firecrawl, keys.parallel].filter((item): item is string =>
    Boolean(item)
  )
}

export function blankStages(): StageState[] {
  return [
    {
      id: "search",
      status: "running",
      detail: "Asking Exa for 10 companies in each target country.",
      startedAt: now(),
    },
    {
      id: "extract",
      status: "pending",
      detail: "Waiting to read buyer pages with Firecrawl.",
    },
    {
      id: "context",
      status: "pending",
      detail: "Waiting for Parallel deep research on the shortlist, competitors, and market.",
    },
    {
      id: "classify",
      status: "pending",
      detail: "Waiting to score each lead against the supplier.",
    },
  ]
}

export function createRun(brief: Brief): Run {
  const timestamp = now()
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    mode: "live",
    status: "searching",
    brief,
    stages: blankStages(),
    logs: [
      {
        at: timestamp,
        stage: "search",
        message: `Qualification started for ${brief.supplierName}.`,
      },
    ],
    leads: [],
    competitors: [],
    contextState: "pending",
  }
}

function applyResearch(
  run: Run,
  parsed: NonNullable<Awaited<ReturnType<typeof researchResult>>>
) {
  run.market = parsed.market
  run.competitors = parsed.competitors
  const unmatched: string[] = []
  for (const note of parsed.leads) {
    const lead = run.leads.find(
      (item) => namesMatch(item.name, note.company) || namesMatch(item.domain, note.company)
    )
    if (!lead) {
      unmatched.push(note.company)
      continue
    }
    lead.context = {
      fitNarrative: note.fitNarrative,
      knownSuppliers: note.knownSuppliers,
      risks: note.risks,
      citations: note.citations,
    }
  }
  if (unmatched.length) {
    log(
      run,
      "context",
      `Parallel returned notes that did not match a lead: ${unmatched.join(", ")}.`
    )
  }
  const context = stage(run, "context")
  context.status = "done"
  context.finishedAt = now()
  context.detail = `Market note attached. ${parsed.competitors.length} competitor suppliers. Fit notes on ${parsed.leads.length} names.`
  run.contextState = "done"
  log(run, "context", context.detail)
}

function rescore(run: Run) {
  for (const lead of run.leads) lead.score = scoreLead(run.brief, lead)
  run.leads.sort(compareLeads)
  const classify = stage(run, "classify")
  classify.status = "done"
  classify.finishedAt = now()
  const best = run.leads.find((lead) => lead.score && !lead.score.disqualified)
  classify.detail = best?.score
    ? `${run.leads.length} leads scored. Top account: ${best.name} at ${best.score.total}.`
    : `${run.leads.length} leads scored.`
  run.status = "complete"
  run.error = undefined
  log(run, "classify", classify.detail)
}

async function doSearch(id: string) {
  const keys = getKeys()
  const claimed = await updateRun(id, (run) => {
    if (run.status === "failed" || run.status === "complete") return "stop" as const
    if (run.leads.length > 0) return "resume" as const
    if (run.searchClaimed) return "busy" as const
    run.searchClaimed = true
    run.status = "searching"
    const search = stage(run, "search")
    search.status = "running"
    search.startedAt = search.startedAt ?? now()
    return "go" as const
  })
  if (claimed !== "go") {
    if (claimed === "busy") {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return
    }
    if (claimed === "resume") {
      await updateRun(id, (run) => {
        if (run.status === "searching") run.status = "extracting"
        const search = stage(run, "search")
        if (search.status === "running") {
          search.status = "done"
          search.finishedAt = now()
        }
      })
    }
    return
  }
  if (!keys.exa) {
    await updateRun(id, (run) => {
      run.status = "failed"
      run.error = "Add an Exa API key under Sources, then start a new qualification."
      const search = stage(run, "search")
      search.status = "failed"
      search.detail = run.error
      search.finishedAt = now()
      log(run, "search", run.error ?? "Exa key missing.")
    })
    return
  }
  try {
    const run = getRun(id)
    if (!run) return
    const leads = await searchLeads(run.brief, keys.exa)
    await updateRun(id, (current) => {
      if (leads.length === 0) {
        current.status = "failed"
        current.error =
          "Exa returned no company pages after the supplier’s own domain was removed. Broaden the products or the markets and run again."
        const search = stage(current, "search")
        search.status = "failed"
        search.detail = current.error
        search.finishedAt = now()
        log(current, "search", current.error)
        return
      }
      current.leads = leads
      current.status = "extracting"
      const search = stage(current, "search")
      search.status = "done"
      search.finishedAt = now()
      const byCountry = new Map<string, number>()
      for (const lead of leads) {
        const country = lead.market || "Unassigned"
        byCountry.set(country, (byCountry.get(country) ?? 0) + 1)
      }
      const counts = [...byCountry.entries()].map(([country, count]) => `${country}: ${count}`)
      search.detail = `Exa returned ${leads.length} companies. ${counts.join(" · ")}.`
      log(current, "search", search.detail)
      const extract = stage(current, "extract")
      extract.status = "running"
      extract.startedAt = now()
      extract.detail = "Reading the first company page."
    })
  } catch (error) {
    const message = publicError(error, secrets())
    await updateRun(id, (run) => {
      run.status = "failed"
      run.error = message
      run.searchClaimed = false
      const search = stage(run, "search")
      search.status = "failed"
      search.detail = message
      search.finishedAt = now()
      log(run, "search", message)
    })
  }
}

async function doExtract(id: string): Promise<"wait" | "next"> {
  const keys = getKeys()
  const plan = await updateRun(id, (run) => {
    if (!keys.firecrawl) {
      const extract = stage(run, "extract")
      extract.status = "blocked"
      extract.finishedAt = now()
      extract.detail =
        "Firecrawl API key is missing. Scoring will use the Exa excerpts only."
      log(run, "extract", extract.detail)
      run.status = "researching"
      return { action: "skip" as const }
    }
    const pending = run.leads.find((lead) => !lead.extraction)
    if (!pending) {
      const extract = stage(run, "extract")
      extract.status = "done"
      extract.finishedAt = now()
      const failed = run.leads.filter((lead) => lead.extraction && !lead.extraction.ok).length
      extract.detail =
        failed > 0
          ? `Pages read. ${failed} ${failed === 1 ? "page" : "pages"} could not be extracted.`
          : `Firecrawl extracted a buyer profile for ${run.leads.length} companies.`
      log(run, "extract", extract.detail)
      run.status = "researching"
      return { action: "done" as const }
    }
    const extract = stage(run, "extract")
    extract.status = "running"
    extract.startedAt = extract.startedAt ?? now()
    const index = run.leads.indexOf(pending) + 1
    extract.detail = `Reading ${pending.name} (${index} of ${run.leads.length}).`
    return {
      action: "read" as const,
      leadId: pending.id,
      url: pending.url,
      country: pending.market ?? "",
    }
  })
  if (!plan || plan.action !== "read") return "next"
  try {
    const run = getRun(id)
    if (!run || !keys.firecrawl) return "next"
    const extraction = await extractPage(plan.url, run.brief, keys.firecrawl, plan.country)
    await updateRun(id, (current) => {
      const lead = current.leads.find((item) => item.id === plan.leadId)
      if (!lead) return
      lead.extraction = extraction
      if (!lead.country && extraction.country) lead.country = extraction.country
      log(
        current,
        "extract",
        extraction.ok
          ? `Extracted ${lead.name}: ${extraction.role || "role unpublished"}.`
          : `Could not extract ${lead.name}. ${extraction.error ?? "Unknown page error."}`
      )
    })
  } catch (error) {
    const message = publicError(error, secrets())
    await updateRun(id, (current) => {
      const lead = current.leads.find((item) => item.id === plan.leadId)
      if (!lead) return
      lead.extraction = {
        ok: false,
        error: message,
        companyName: "",
        headquarters: "",
        country: "",
        role: "",
        buys: [],
        sells: [],
        markets: [],
        certifications: [],
        buyerSignals: [],
        summary: "",
        excerpt: "",
      }
      log(current, "extract", `Could not extract ${lead.name}. ${message}`)
    })
  }
  return "next"
}

async function doResearch(id: string): Promise<"wait" | "next"> {
  const keys = getKeys()
  const snapshot = getRun(id)
  if (!snapshot) return "next"
  if (!keys.parallel) {
    await updateRun(id, (run) => {
      const context = stage(run, "context")
      context.status = "blocked"
      context.finishedAt = now()
      context.detail =
        "Parallel API key is missing. Scoring uses search and page evidence only."
      run.contextState = "skipped"
      run.status = "scoring"
      log(run, "context", context.detail)
    })
    return "next"
  }
  if (snapshot.contextState === "failed" && !snapshot.parallelRunId) {
    await updateRun(id, (run) => {
      run.status = "scoring"
    })
    return "next"
  }
  if (!snapshot.parallelRunId) {
    try {
      const created = await createResearch(snapshot.brief, snapshot.leads, keys.parallel)
      await updateRun(id, (run) => {
        run.parallelRunId = created.runId
        run.parallelInteractionId = created.interactionId
        run.contextState = "running"
        run.status = "researching"
        const context = stage(run, "context")
        context.status = "running"
        context.startedAt = now()
        context.detail = `Parallel ${created.processor} is researching the shortlist. Run ${created.runId}.`
        log(run, "context", context.detail)
      })
    } catch (error) {
      const message = publicError(error, secrets())
      await updateRun(id, (run) => {
        run.contextState = "failed"
        const context = stage(run, "context")
        context.status = "failed"
        context.finishedAt = now()
        context.detail = message
        run.status = "scoring"
        log(run, "context", message)
      })
    }
    return "next"
  }

  try {
    const status = await researchStatus(snapshot.parallelRunId, keys.parallel)
    const normalized = status.status.toLowerCase()
    if (normalized === "completed") {
      const parsed = await researchResult(snapshot.parallelRunId, keys.parallel)
      await updateRun(id, (run) => {
        if (!parsed) {
          run.contextState = "failed"
          const context = stage(run, "context")
          context.status = "failed"
          context.detail = "Parallel completed without a readable report."
          context.finishedAt = now()
          log(run, "context", context.detail)
        } else {
          applyResearch(run, parsed)
        }
        run.status = "scoring"
      })
      return "next"
    }
    if (normalized === "failed" || normalized === "cancelled" || normalized === "canceled") {
      await updateRun(id, (run) => {
        run.contextState = "failed"
        const context = stage(run, "context")
        context.status = "failed"
        context.finishedAt = now()
        context.detail = status.error || `Parallel status: ${status.status}.`
        run.status = "scoring"
        log(run, "context", context.detail)
      })
      return "next"
    }
    const started = snapshot.stages.find((item) => item.id === "context")?.startedAt
    const elapsed = started ? Date.now() - Date.parse(started) : 0
    if (elapsed > RESEARCH_BUDGET_MS) {
      await updateRun(id, (run) => {
        run.contextState = "deferred"
        const context = stage(run, "context")
        context.status = "blocked"
        context.detail = `Parallel is still running (${snapshot.parallelRunId}). Scored on the evidence already collected. Reopen this run to attach the report.`
        log(run, "context", context.detail)
        run.status = "scoring"
      })
      return "next"
    }
    await updateRun(id, (run) => {
      const context = stage(run, "context")
      context.status = "running"
      context.detail = `Parallel is ${status.status}. The market note is the long step.`
    })
    return "wait"
  } catch (error) {
    const message = publicError(error, secrets())
    const giveUp = await updateRun(id, (run) => {
      run.parallelErrors = (run.parallelErrors ?? 0) + 1
      log(run, "context", message)
      if ((run.parallelErrors ?? 0) >= 3) {
        run.contextState = "failed"
        const context = stage(run, "context")
        context.status = "failed"
        context.finishedAt = now()
        context.detail = message
        run.status = "scoring"
        return true
      }
      return false
    })
    return giveUp ? "next" : "wait"
  }
}

async function doScore(id: string) {
  await updateRun(id, (run) => {
    const classify = stage(run, "classify")
    classify.status = "running"
    classify.startedAt = classify.startedAt ?? now()
    classify.detail = "Scoring product fit, buyer role, geography, and evidence."
    rescore(run)
  })
}

async function maybeAttachDeferred(id: string) {
  const run = getRun(id)
  const keys = getKeys()
  if (!run || run.contextState !== "deferred" || run.market || !run.parallelRunId || !keys.parallel) {
    return
  }
  const last = run.parallelCheckedAt ? Date.parse(run.parallelCheckedAt) : 0
  if (Date.now() - last < 20000) return
  await updateRun(id, (current) => {
    current.parallelCheckedAt = now()
  })
  try {
    const status = await researchStatus(run.parallelRunId, keys.parallel)
    if (status.status.toLowerCase() !== "completed") {
      await updateRun(id, (current) => {
        log(current, "context", `Parallel is still ${status.status}.`)
      })
      return
    }
    const parsed = await researchResult(run.parallelRunId, keys.parallel)
    if (!parsed) return
    await updateRun(id, (current) => {
      applyResearch(current, parsed)
      rescore(current)
    })
  } catch (error) {
    const message = publicError(error, secrets())
    await updateRun(id, (current) => {
      log(current, "context", message)
    })
  }
}

async function pump(id: string) {
  try {
    for (let guard = 0; guard < 80; guard += 1) {
      const run = getRun(id)
      if (!run || run.mode === "sample") return
      if (run.status === "failed") return
      if (run.status === "complete") {
        await maybeAttachDeferred(id)
        return
      }
      if (run.status === "queued" || run.status === "searching") {
        await doSearch(id)
        continue
      }
      if (run.status === "extracting") {
        await doExtract(id)
        continue
      }
      if (run.status === "researching") {
        const action = await doResearch(id)
        if (action === "wait") await new Promise((resolve) => setTimeout(resolve, 12000))
        continue
      }
      if (run.status === "scoring") {
        await doScore(id)
        return
      }
      return
    }
    await updateRun(id, (run) => {
      run.status = "failed"
      run.error = "The pipeline stopped after too many steps. Start a fresh qualification."
      log(run, "system", run.error)
    })
  } catch (error) {
    const message = publicError(error, secrets())
    await updateRun(id, (run) => {
      run.status = "failed"
      run.error = message
      log(run, "system", message)
    })
  }
}

export function ensurePump(id: string) {
  if (id === SAMPLE_RUN_ID || running.has(id)) return
  const run = getRun(id)
  if (!run || run.mode === "sample") return
  const active = run.status !== "complete" && run.status !== "failed"
  const deferred =
    run.status === "complete" && run.contextState === "deferred" && !run.market
  if (!active && !deferred) return
  if (deferred) {
    const last = run.parallelCheckedAt ? Date.parse(run.parallelCheckedAt) : 0
    if (Date.now() - last < 20000) return
  }
  running.add(id)
  void pump(id).finally(() => running.delete(id))
}

export async function startRun(brief: Brief): Promise<Run> {
  const run = createRun(brief)
  await insertRun(run)
  ensurePump(run.id)
  return run
}

export function leadById(run: Run, leadId: string): Lead | undefined {
  return run.leads.find((lead) => lead.id === leadId)
}

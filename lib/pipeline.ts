import { searchLeads } from "./exa"
import { extractPage, failedExtraction } from "./firecrawl"
import { publicError } from "./http"
import { getKeys } from "./keys"
import { scoreLeads } from "./openai"
import {
  createResearch,
  decideResearch,
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
  return [keys.exa, keys.firecrawl, keys.openai, keys.parallel].filter((item): item is string =>
    Boolean(item)
  )
}

export function blankStages(): StageState[] {
  return [
    {
      id: "search",
      status: "running",
      detail: "Exa Agent is in search mode, asking for 10 companies in each target country.",
      startedAt: now(),
    },
    {
      id: "extract",
      status: "pending",
      detail: "Waiting for Firecrawl Agent to collect ICP fields and published contacts.",
    },
    {
      id: "classify",
      status: "pending",
      detail: "Waiting for OpenAI to score fit and name a preliminary best fit.",
    },
    {
      id: "context",
      status: "pending",
      detail: "Waiting for Parallel to refine that score and research the market.",
    },
  ]
}

export function createRun(brief: Brief, also?: Brief): Run {
  const timestamp = now()
  const names = also ? `${brief.supplierName} and ${also.supplierName}` : brief.supplierName
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    mode: "live",
    status: "searching",
    brief,
    also,
    stages: blankStages(),
    logs: [
      {
        at: timestamp,
        stage: "search",
        message: `Qualification started for ${names}. Exa searches, Firecrawl collects contacts, OpenAI scores, and Parallel refines the best fit.`,
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
      icp: note.icp,
      supplierFits: note.supplierFits,
      bestFit: note.bestFit,
      qualificationNeeded: note.qualificationNeeded,
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
  context.detail = `Best fit attached for ${parsed.leads.length} names. ${parsed.competitors.length} competitor suppliers.`
  run.contextState = "done"
  log(run, "context", context.detail)
}

function fitRank(lead: Lead): number {
  const level = lead.context?.icp || lead.openai?.icp
  if (level === "high") return 3
  if (level === "medium") return 2
  if (level === "low") return 1
  return 0
}

function fileChecklist(run: Run) {
  for (const lead of run.leads) {
    lead.score = scoreLead(run.brief, lead)
    lead.alsoScore = run.also ? scoreLead(run.also, lead) : undefined
  }
  run.leads.sort((left, right) => fitRank(right) - fitRank(left) || compareLeads(left, right))
}

function finish(run: Run) {
  fileChecklist(run)
  run.status = "complete"
  run.error = undefined
  const parallel = run.leads.filter((lead) => lead.context?.icp).length
  const openai = run.leads.filter((lead) => lead.openai).length
  log(
    run,
    "system",
    parallel
      ? `Parallel set the final best fit on ${parallel} of ${run.leads.length} companies.`
      : openai
        ? `OpenAI’s preliminary best fit is still the one on the desk. Parallel did not replace it.`
        : `No model score is attached. The table is the evidence checklist.`
  )
}

const activeSearches = new Set<string>()

async function doSearch(id: string): Promise<"busy" | "done"> {
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
      if (activeSearches.has(id)) return "busy"
      await updateRun(id, (run) => {
        if (run.status === "searching") run.searchClaimed = false
      })
      return "done"
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
    return "done"
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
    return "done"
  }
  activeSearches.add(id)
  try {
    const run = getRun(id)
    if (!run) return "done"
    const found = await searchLeads(run.brief, keys.exa, run.also)
    const leads = found.leads
    await updateRun(id, (current) => {
      if (leads.length === 0) {
        current.status = "failed"
        current.error =
          found.outside > 0
            ? `Exa suggested ${found.outside} ${found.outside === 1 ? "company" : "companies"} from another country or another supplier. None were in ${current.brief.markets}.`
            : "Exa returned no company pages after the supplier’s own domain was removed. Broaden the products or the markets and run again."
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
      search.detail = `Exa Agent search returned ${leads.length} companies. ${counts.join(" · ")}.`
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
  } finally {
    activeSearches.delete(id)
  }
  return "done"
}

async function doExtract(id: string): Promise<"wait" | "next"> {
  const keys = getKeys()
  const plan = await updateRun(id, (run) => {
    if (!keys.firecrawl) {
      const extract = stage(run, "extract")
      extract.status = "blocked"
      extract.finishedAt = now()
      extract.detail =
        "Firecrawl API key is missing. OpenAI will score the Exa search notes only."
      log(run, "extract", extract.detail)
      run.status = "scoring"
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
          : `Firecrawl Agent collected ICP fields and contacts for ${run.leads.length} companies.`
      log(run, "extract", extract.detail)
      run.status = "scoring"
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
      buyerType: pending.buyerType ?? "",
    }
  })
  if (!plan || plan.action !== "read") return "next"
  try {
    const run = getRun(id)
    if (!run || !keys.firecrawl) return "next"
    const extraction = await extractPage(
      plan.url,
      run.brief,
      keys.firecrawl,
      plan.country,
      plan.buyerType
    )
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
      lead.extraction = failedExtraction(message)
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
        "Parallel API key is missing. OpenAI’s score stays as the best fit."
      run.contextState = "skipped"
      finish(run)
      log(run, "context", context.detail)
    })
    return "next"
  }
  if (snapshot.brief.parallelMode === "decisions") {
    if (snapshot.parallelDecisionId || snapshot.contextState === "done") return "next"
    if (snapshot.contextState === "failed") {
      await updateRun(id, (run) => {
        finish(run)
      })
      return "next"
    }
    try {
      await updateRun(id, (run) => {
        run.contextState = "running"
        run.status = "researching"
        const context = stage(run, "context")
        context.status = "running"
        context.startedAt = context.startedAt ?? now()
        context.detail = "Parallel Decisions (fast) is answering this run. The default Task call is not used."
        log(run, "context", context.detail)
      })
      const decided = await decideResearch(snapshot.brief, snapshot.leads, keys.parallel, snapshot.also)
      await updateRun(id, (run) => {
        run.parallelDecisionId = decided.decisionId
        applyResearch(run, decided.research)
        finish(run)
      })
    } catch (error) {
      const message = publicError(error, secrets())
      await updateRun(id, (run) => {
        run.contextState = "failed"
        const context = stage(run, "context")
        context.status = "failed"
        context.finishedAt = now()
        context.detail = message
        finish(run)
        log(run, "context", message)
      })
    }
    return "next"
  }
  if (snapshot.contextState === "failed" && !snapshot.parallelRunId) {
    await updateRun(id, (run) => {
      finish(run)
    })
    return "next"
  }
  if (!snapshot.parallelRunId) {
    try {
      const created = await createResearch(
        snapshot.brief,
        snapshot.leads,
        keys.parallel,
        snapshot.also
      )
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
        finish(run)
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
        finish(run)
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
        finish(run)
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
        context.detail = `Parallel is still running (${snapshot.parallelRunId}). OpenAI’s score stays until you reopen this run.`
        log(run, "context", context.detail)
        finish(run)
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
        finish(run)
        return true
      }
      return false
    })
    return giveUp ? "next" : "wait"
  }
}

function applyOpenAI(run: Run, judgments: Awaited<ReturnType<typeof scoreLeads>>["leads"]) {
  for (const note of judgments) {
    const lead = run.leads.find(
      (item) => namesMatch(item.name, note.company) || namesMatch(item.domain, note.company)
    )
    if (!lead) continue
    lead.openai = {
      icp: note.icp,
      supplierFits: note.supplierFits,
      bestFit: note.bestFit,
      qualificationNeeded: note.qualificationNeeded,
      rationale: note.rationale,
    }
  }
}

async function doScore(id: string) {
  const keys = getKeys()
  const snapshot = getRun(id)
  if (!snapshot) return
  if (!keys.openai) {
    await updateRun(id, (run) => {
      const classify = stage(run, "classify")
      classify.status = "blocked"
      classify.finishedAt = now()
      classify.detail = "OpenAI API key is missing. Parallel can still set the final best fit."
      log(run, "classify", classify.detail)
      run.status = "researching"
    })
    return
  }
  if (snapshot.leads.length > 0 && snapshot.leads.every((lead) => lead.openai)) {
    await updateRun(id, (run) => {
      run.status = "researching"
    })
    return
  }
  await updateRun(id, (run) => {
    const classify = stage(run, "classify")
    classify.status = "running"
    classify.startedAt = classify.startedAt ?? now()
    classify.detail = "OpenAI is scoring product fit and naming a preliminary best fit."
  })
  try {
    const scored = await scoreLeads(snapshot.brief, snapshot.leads, keys.openai, snapshot.also)
    await updateRun(id, (run) => {
      applyOpenAI(run, scored.leads)
      if (scored.entry.purchaseProbability || scored.entry.strategy) run.entry = scored.entry
      const classify = stage(run, "classify")
      classify.status = scored.leads.length ? "done" : "failed"
      classify.finishedAt = now()
      classify.detail = scored.leads.length
        ? `OpenAI scored ${scored.leads.length} companies and set a purchase probability. Parallel still refines it.`
        : "OpenAI returned no scores. Parallel can still set best fit."
      log(run, "classify", classify.detail)
      run.status = "researching"
    })
  } catch (error) {
    const message = publicError(error, secrets())
    await updateRun(id, (run) => {
      const classify = stage(run, "classify")
      classify.status = "failed"
      classify.finishedAt = now()
      classify.detail = message
      log(run, "classify", message)
      run.status = "researching"
    })
  }
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
      fileChecklist(current)
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
    for (let guard = 0; guard < 200; guard += 1) {
      const run = getRun(id)
      if (!run || run.mode === "sample") return
      if (run.status === "failed") return
      if (run.status === "complete") {
        await maybeAttachDeferred(id)
        return
      }
      if (run.status === "queued" || run.status === "searching") {
        const pace = await doSearch(id)
        if (pace === "busy") return
        continue
      }
      if (run.status === "extracting") {
        await doExtract(id)
        continue
      }
      if (run.status === "scoring") {
        await doScore(id)
        continue
      }
      if (run.status === "researching") {
        const action = await doResearch(id)
        if (action === "wait") await new Promise((resolve) => setTimeout(resolve, 12000))
        continue
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

export async function startRun(brief: Brief, also?: Brief): Promise<Run> {
  const run = createRun(brief, also)
  await insertRun(run)
  ensurePump(run.id)
  return run
}

export function leadById(run: Run, leadId: string): Lead | undefined {
  return run.leads.find((lead) => lead.id === leadId)
}

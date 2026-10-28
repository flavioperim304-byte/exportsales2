"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { DownloadResults } from "@/components/download-results"
import { MarketEntry } from "@/components/market-entry"
import { QualifyForm } from "@/components/qualify-form"
import { Badge } from "@/components/ui/badge"
import { STATUS_LABEL, formatWhen, isHttpUrl } from "@/lib/format"
import { qualificationRows } from "@/lib/qualify"
import { summarize } from "@/lib/summary"
import type { Run, RunSummary } from "@/lib/types"

export function Dashboard({
  initialRun,
  summaries,
  sourcesReady,
}: {
  initialRun: Run
  summaries: RunSummary[]
  sourcesReady: number
}) {
  const [run, setRun] = useState(initialRun)
  const [list, setList] = useState(summaries)
  const [inputRevision, setInputRevision] = useState(0)
  const [refreshError, setRefreshError] = useState("")

  useEffect(() => {
    if (run.mode !== "live") return
    if (run.status === "complete" || run.status === "failed") return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const response = await fetch(`/api/runs/${run.id}`, { cache: "no-store" })
        if (!response.ok) {
          if (!stop) setRefreshError("The output could not be refreshed.")
          return
        }
        const data = (await response.json()) as { run: Run }
        if (stop) return
        setRun(data.run)
        setList((current) =>
          current.map((item) => (item.id === data.run.id ? summarize(data.run) : item))
        )
        setRefreshError("")
        timer = setTimeout(tick, 4000)
      } catch {
        if (!stop) setRefreshError("The output could not be refreshed.")
      }
    }

    timer = setTimeout(tick, 1500)
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [run.id, run.mode, run.status])

  function remember(id: string) {
    const path = `/?run=${encodeURIComponent(id)}`
    window.history.replaceState(null, "", path)
  }

  async function openRun(id: string) {
    remember(id)
    setRefreshError("")
    const response = await fetch(`/api/runs/${id}`, { cache: "no-store" })
    if (!response.ok) {
      setRefreshError("That run is not on the desk.")
      return
    }
    const data = (await response.json()) as { run: Run }
    setRun(data.run)
    setInputRevision((current) => current + 1)
    setList((current) => {
      const next = summarize(data.run)
      return [next, ...current.filter((item) => item.id !== data.run.id)]
    })
  }

  function started(id: string) {
    void openRun(id)
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Export desk</p>
          <h1 className="mt-1 font-serif text-4xl">Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {sourcesReady} of 4 sources connected.{" "}
          <Link href="/sources" className="underline-offset-2 hover:underline">
            Sources
          </Link>
        </p>
      </div>

      {sourcesReady === 0 ? (
        <p className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm leading-relaxed">
          Exa, Firecrawl, OpenAI, and Parallel have no keys yet. The sample output on the right does not need them.
        </p>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {list.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void openRun(item.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-left text-sm ${
              item.id === run.id ? "border-primary bg-card" : "border-border bg-card/60"
            }`}
          >
            <span className="font-medium">{item.supplierName || "Qualification"}</span>
            <span className="ml-2 text-muted-foreground">{STATUS_LABEL[item.status]}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card/40 p-4">
          <h2 className="font-serif text-2xl">Input</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The brief sent to Exa, Firecrawl, OpenAI, and Parallel.
          </p>
          <div className="mt-4">
            <QualifyForm
              key={`${run.id}:${inputRevision}`}
              initial={run.brief}
              compact
              onStarted={started}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl">Output</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {run.brief.searchKind === "competitors"
                  ? `${run.brief.supplierName} distributors`
                  : run.also
                    ? `${run.brief.supplierName} and ${run.also.supplierName}`
                    : run.brief.supplierName}{" "}
                ·{" "}
                {run.brief.searchKind === "competitors"
                  ? `${run.brief.countryCount ?? 5} countries${run.brief.excludedMarkets ? `, excluding ${run.brief.excludedMarkets}` : ""}`
                  : run.brief.markets}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DownloadResults run={run} />
              {run.mode === "sample" ? <Badge variant="outline">Sample</Badge> : null}
              <Badge variant="secondary">{STATUS_LABEL[run.status]}</Badge>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{formatWhen(run.updatedAt || run.createdAt)}</p>
          {run.mode === "sample" ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This table is the coffee sample for Germany, the Netherlands, and Japan. It is not a Kanechom or LQ search.
            </p>
          ) : null}
          {refreshError ? <p className="mt-2 text-sm text-destructive">{refreshError}</p> : null}
          {run.error ? <p className="mt-2 text-sm text-destructive">{run.error}</p> : null}

          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {run.stages.map((stage) => (
              <li key={stage.id} className="rounded-lg border border-border px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{stage.status}</p>
                <p className="mt-1 text-sm leading-relaxed">{stage.detail}</p>
              </li>
            ))}
          </ol>

          <MarketEntry run={run} />

          <OutputTable run={run} />

          {run.market?.outlook ? (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Market</p>
              <p className="mt-2 text-sm leading-relaxed">{run.market.outlook}</p>
            </div>
          ) : null}

          <p className="mt-4 text-sm">
            <Link href={`/runs/${run.id}`} className="underline-offset-2 hover:underline">
              Open the full dossier
            </Link>
          </p>
        </section>
      </div>
    </main>
  )
}

function OutputTable({ run }: { run: Run }) {
  const rows = qualificationRows(run.leads, run.brief, run.also)
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
        No companies yet. The output fills in as Exa returns names, Firecrawl adds contacts, and the scores arrive.
      </p>
    )
  }
  const leads = new Map(run.leads.map((lead) => [lead.name, lead]))
  const scoredBy = rows.some((row) => row.source === "parallel")
    ? "Parallel set the final best fit."
    : rows.some((row) => row.source === "openai")
      ? "OpenAI scored this list. Parallel has not refined it."
      : "Neither OpenAI nor Parallel has scored this list. These levels are the evidence checklist."
  return (
    <div className="mt-4">
      <p className="text-sm text-muted-foreground">{scoredBy}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Company</th>
              <th className="py-2 pr-3 font-medium">Country</th>
              <th className="py-2 pr-3 font-medium">ICP</th>
              <th className="py-2 pr-3 font-medium">Best fit</th>
              <th className="py-2 pr-3 font-medium">Email</th>
              <th className="py-2 pr-3 font-medium">Phone</th>
              <th className="py-2 pr-3 font-medium">WhatsApp</th>
              <th className="py-2 pr-3 font-medium">Website</th>
              <th className="py-2 font-medium">Still to confirm</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const lead = leads.get(row.company)
              const email = lead?.extraction?.email || ""
              const phone = lead?.extraction?.phone || ""
              const whatsapp = lead?.extraction?.whatsapp || ""
              const website = lead?.extraction?.website || lead?.url || ""
              return (
                <tr key={row.company} className="border-b border-border/70 align-top">
                  <td className="py-3 pr-3 font-medium">
                    {row.company}
                    {lead?.buyerType ? (
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">{lead.buyerType}</span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">{row.country}</td>
                  <td className="py-3 pr-3 uppercase">{row.level}</td>
                  <td className="py-3 pr-3">{row.bestFit}</td>
                  <td className="py-3 pr-3">{email || "—"}</td>
                  <td className="py-3 pr-3">{phone || "—"}</td>
                  <td className="py-3 pr-3">{whatsapp || "—"}</td>
                  <td className="py-3 pr-3">
                    {website && isHttpUrl(website) ? (
                      <a href={website} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                        {lead?.domain || website}
                      </a>
                    ) : (
                      website || "—"
                    )}
                  </td>
                  <td className="py-3 text-muted-foreground">{row.qualificationNeeded}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

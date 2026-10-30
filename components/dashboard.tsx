"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { isHttpUrl, mailtoHref, telHref } from "@/lib/format"
import { qualificationRows } from "@/lib/qualify"
import { summarize } from "@/lib/summary"
import type { Run, RunSummary } from "@/lib/types"

export function Dashboard({
  initialRun,
  runs,
  summaries,
  sourcesReady,
}: {
  initialRun: Run
  runs: Run[]
  summaries: RunSummary[]
  sourcesReady: number
}) {
  const [run, setRun] = useState(initialRun)
  const [list, setList] = useState(summaries)
  const [focusId, setFocusId] = useState<string>("all")
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

  const buyers = buyerRows(runs.length > 0 ? runs : [initialRun].filter((item) => item.mode !== "sample"))
  const visible = focusId === "all" ? buyers : buyers.filter((buyer) => buyer.runId === focusId)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Export desk</p>
          <h1 className="mt-1 font-serif text-3xl leading-tight sm:text-4xl">Compradores</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {visible.length} empresas nas buscas de Kanechom e LQ Professional. A nota de encaixe de cada uma já está gravada; abra a busca para a ficha completa.
          </p>
        </div>
        <Link
          href="/qualify"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm text-primary-foreground sm:h-10"
        >
          Nova busca
        </Link>
      </div>

      {sourcesReady < 4 ? (
        <p className="text-sm text-muted-foreground">
          {sourcesReady} de 4 fontes conectadas.{" "}
          <Link href="/sources" className="underline-offset-2 hover:underline">
            Abrir fontes
          </Link>
          .
        </p>
      ) : null}
      {refreshError ? <p className="text-sm text-destructive">{refreshError}</p> : null}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setFocusId("all")}
          className={`shrink-0 rounded-full border px-4 py-2 text-sm md:px-3 md:py-1.5 ${focusId === "all" ? "border-primary bg-card" : "border-border bg-card/60"}`}
        >
          Todas
        </button>
        {list
          .filter((item) => item.mode !== "sample")
          .map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFocusId(item.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-left text-sm md:px-3 md:py-1.5 ${
                focusId === item.id ? "border-primary bg-card" : "border-border bg-card/60"
              }`}
            >
              <span className="font-medium">{item.supplierName}</span>
              <span className="ml-2 text-muted-foreground">{item.markets}</span>
            </button>
          ))}
      </div>

      {focusId !== "all" ? (
        <p className="text-sm">
          <Link href={`/runs/${focusId}`} className="underline-offset-2 hover:underline">
            Abrir a análise completa desta busca
          </Link>
        </p>
      ) : null}

      <BuyerBoard buyers={visible} />
    </main>
  )
}

type Buyer = {
  runId: string
  company: string
  country: string
  brand: string
  fit: string
  email: string
  phone: string
  website: string
  note: string
}

function buyerRows(runs: Run[]): Buyer[] {
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const rows: Buyer[] = []
  for (const run of runs) {
    const leads = new Map(run.leads.map((lead) => [lead.name, lead]))
    for (const row of qualificationRows(run.leads, run.brief, run.also)) {
      const lead = leads.get(row.company)
      rows.push({
        runId: run.id,
        company: row.company,
        country: row.country || run.brief.markets,
        brand: run.brief.supplierName,
        fit: row.bestFit,
        email: lead?.extraction?.email || "",
        phone: lead?.extraction?.phone || lead?.extraction?.whatsapp || "",
        website: lead?.extraction?.website || lead?.url || "",
        note: lead?.context?.fitNarrative || lead?.score?.headline || "",
      })
    }
  }
  return rows.sort(
    (a, b) =>
      (rank[a.fit] ?? 3) - (rank[b.fit] ?? 3) ||
      a.country.localeCompare(b.country) ||
      a.company.localeCompare(b.company)
  )
}

function BuyerBoard({ buyers }: { buyers: Buyer[] }) {
  if (buyers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
        Nenhuma empresa nesta busca.
      </p>
    )
  }
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {buyers.map((buyer) => (
          <li key={`${buyer.runId}:${buyer.company}`} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium leading-snug">{buyer.company}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {buyer.country} · {buyer.brand}
                </p>
              </div>
              <p className="shrink-0 text-sm">{buyer.fit}</p>
            </div>
            {buyer.note ? (
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{buyer.note}</p>
            ) : null}
            <div className="mt-3 flex flex-col gap-1 text-sm">
              <ContactLine label="Email" value={buyer.email} href={mailtoHref(buyer.email)} />
              <ContactLine label="Telefone" value={buyer.phone} href={telHref(buyer.phone)} />
              <ContactLine
                label="Site"
                value={buyer.website && isHttpUrl(buyer.website) ? "Abrir site" : ""}
                href={buyer.website && isHttpUrl(buyer.website) ? buyer.website : ""}
                external
              />
            </div>
            <Link
              href={`/runs/${buyer.runId}`}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg border border-border text-sm"
            >
              Abrir análise
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="px-3 py-3 font-medium">Empresa</th>
            <th className="px-3 py-3 font-medium">País</th>
            <th className="px-3 py-3 font-medium">Marca</th>
            <th className="px-3 py-3 font-medium">Encaixe</th>
            <th className="px-3 py-3 font-medium">Email</th>
            <th className="px-3 py-3 font-medium">Telefone</th>
            <th className="px-3 py-3 font-medium">Site</th>
          </tr>
        </thead>
        <tbody>
          {buyers.map((buyer) => (
            <tr key={`${buyer.runId}:${buyer.company}`} className="border-b border-border/70 align-top">
              <td className="px-3 py-3">
                <Link href={`/runs/${buyer.runId}`} className="font-medium underline-offset-2 hover:underline">
                  {buyer.company}
                </Link>
                {buyer.note ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{buyer.note}</p>
                ) : null}
              </td>
              <td className="px-3 py-3 text-muted-foreground">{buyer.country}</td>
              <td className="px-3 py-3">{buyer.brand}</td>
              <td className="px-3 py-3">{buyer.fit}</td>
              <td className="px-3 py-3">{buyer.email || "—"}</td>
              <td className="px-3 py-3">{buyer.phone || "—"}</td>
              <td className="px-3 py-3">
                {buyer.website && isHttpUrl(buyer.website) ? (
                  <a href={buyer.website} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                    site
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

function ContactLine({
  label,
  value,
  href,
  external = false,
}: {
  label: string
  value: string
  href: string
  external?: boolean
}) {
  return (
    <p className="flex min-w-0 gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      {value && href ? (
        <a
          href={href}
          className="min-w-0 break-all underline-offset-2 hover:underline"
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        >
          {value}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </p>
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

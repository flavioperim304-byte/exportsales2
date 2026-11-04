"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { WatchLead } from "@/lib/monitors"

type Payload = {
  webhookUrl: string
  period: string
  event: string
  signals: string[]
  queryExample: string
  topPerCountry: number
  watch: WatchLead[]
  monitors: { id: string; name: string; country: string; rank: number; query: string }[]
  exa: boolean
  createAllowed: boolean
  error?: string
}

export function MonitorPanel() {
  const [data, setData] = useState<Payload | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")

  async function load() {
    const response = await fetch("/api/monitors", { cache: "no-store" })
    if (!response.ok) return
    setData((await response.json()) as Payload)
  }

  useEffect(() => {
    void load()
  }, [])

  const grouped = new Map<string, WatchLead[]>()
  for (const row of data?.watch ?? []) {
    const list = grouped.get(row.country) ?? []
    list.push(row)
    grouped.set(row.country, list)
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Monitor Exa · semanal</p>
          <h2 className="mt-1 font-serif text-2xl">Top 3 por país</h2>
        </div>
        <Button
          type="button"
          className="h-11 sm:h-10"
          disabled={busy || !data?.exa || !data.createAllowed || data.watch.length === 0}
          onClick={async () => {
            setBusy(true)
            setNote("")
            try {
              const response = await fetch("/api/monitors", { method: "POST" })
              const body = (await response.json()) as {
                created?: number
                kept?: number
                removed?: number
                errors?: string[]
                error?: string
              }
              if (!response.ok) {
                setNote(body.error || body.errors?.[0] || "Não criou os monitors.")
                return
              }
              setNote(
                `Criados ${body.created ?? 0} · mantidos ${body.kept ?? 0} · removidos ${body.removed ?? 0}.`
              )
              await load()
            } catch {
              setNote("O desk não conseguiu falar com a Exa.")
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? "Criando…" : "Criar monitors"}
        </Button>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        As leads antigas não entram nas tabelas CRM. O desk pega os 3 melhores ranks de cada país
        (probabilidade de resposta, depois fit) e cria um monitor Exa por empresa. Cada monitor
        roda a cada 7 dias e manda só o que é novo para o webhook no Render. Sinais definidos na
        query: news, product launches, promotion, exhibitions, events, mentions. Não é compra
        Kanechom/LQ.
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Webhook</dt>
          <dd className="mt-0.5 break-all font-mono text-xs">{data?.webhookUrl || "…"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Trigger</dt>
          <dd className="mt-0.5">
            interval · {data?.period || "7d"} · evento {data?.event || "monitor.run.completed"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Query</dt>
          <dd className="mt-0.5 font-mono text-xs leading-relaxed">{data?.queryExample || "…"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Sinais</dt>
          <dd className="mt-0.5">{(data?.signals ?? []).join(" · ")}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        Crie no live (HTTPS). Localhost a Exa recusa. O webhookSecret volta uma vez e fica em
        data/monitors.json no disco do Render. O cron de Atualizar sinais não gasta Exa Search nas
        empresas já monitoradas.
      </p>
      {!data?.exa ? (
        <p className="mt-3 text-sm text-destructive">Exa não está nesta instância. Abra Fontes no live.</p>
      ) : null}
      {data && data.exa && !data.createAllowed ? (
        <p className="mt-3 text-sm">
          Esta máquina não é o Render. A configuração está visível; clique Criar monitors em{" "}
          <a href="https://exportsales.onrender.com/leads" className="underline-offset-2 hover:underline">
            exportsales.onrender.com/leads
          </a>{" "}
          para o webhookSecret gravar no disco que recebe o POST.
        </p>
      ) : null}
      {note ? <p className="mt-3 text-sm">{note}</p> : null}
      {grouped.size === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Ainda não há busca live com score. Rode Nova busca; os 3 melhores de cada país aparecem
          aqui.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {[...grouped.entries()].map(([country, rows]) => (
            <li key={country} className="rounded-lg border border-border px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{country}</p>
              <ol className="mt-2 flex flex-col gap-1.5 text-sm">
                {rows.map((row) => (
                  <li key={`${row.runId}:${row.leadId}`}>
                    {row.rank}. {row.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · resposta {row.responseScore}/100
                      {row.band ? ` · ${row.band}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
      {data?.monitors.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {data.monitors.length} monitor{data.monitors.length === 1 ? "" : "es"} ativo
          {data.monitors.length === 1 ? "" : "s"} na Exa.
        </p>
      ) : null}
    </section>
  )
}

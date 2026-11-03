"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { LeadRecord } from "@/lib/types"

export function LeadsBoard({
  records,
  postgres,
  error,
}: {
  records: LeadRecord[]
  postgres: boolean
  error?: string
}) {
  const [query, setQuery] = useState("")
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return records
    return records.filter((row) =>
      [row.name, row.country, row.domain, row.supplier, row.email, row.market]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle))
    )
  }, [query, records])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {records.length} empresa{records.length === 1 ? "" : "s"} ·{" "}
          {postgres ? "Postgres" : "arquivo local (data/runs.json)"}
        </p>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar nome, país, marca…"
          className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm sm:h-10 sm:max-w-xs"
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive">
          DATABASE_URL está definida, mas o Postgres não respondeu. O desk leu o arquivo local.{" "}
          {error}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          {records.length === 0
            ? "Nenhuma lead gravada ainda. Rode Nova busca. Depois, no Render (serviço Node exportsales), grave DATABASE_URL com a URI Session pooler do Supabase."
            : "Nenhuma lead neste filtro."}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {visible.map((row) => (
            <li
              key={`${row.runId}:${row.id}`}
              className="flex flex-col rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{row.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.country || "País não informado"} · {row.supplier}
                    {row.seed ? ` · ${row.seed}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium">
                  {row.fit || row.band || "sem score"}
                  {row.score != null ? ` · ${row.score}` : ""}
                </p>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {row.email || row.phone || row.website || "Sem contato publicado nesta linha."}
              </p>
              {row.lastPurchase ? (
                <p className="mt-2 text-sm">Última compra na página: {row.lastPurchase}</p>
              ) : null}
              <p className="mt-3 text-sm">
                <Link href={`/runs/${row.runId}`} className="underline-offset-2 hover:underline">
                  Abrir a busca
                </Link>
                {row.domain ? (
                  <>
                    {" · "}
                    <span className="text-muted-foreground">{row.domain}</span>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

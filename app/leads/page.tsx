import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { LeadsBoard } from "@/components/leads-board"
import { MonitorPanel } from "@/components/monitor-panel"
import { postgresStatus } from "@/lib/lead-db"
import { listLeadRecords } from "@/lib/store"

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-7xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Abrindo as leads…</p>
        </main>
      }
    >
      <LeadsLoader />
    </Suspense>
  )
}

async function LeadsLoader() {
  await connection()
  const [records, db] = await Promise.all([listLeadRecords(), postgresStatus()])
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:py-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            Desk
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Leads</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Empresas das buscas Kanechom e LQ. No Supabase isso grava em desk_runs e desk_leads;
          tabelas antigas (Leads, leads_master, tradeindata_*) não aparecem aqui. Cada Best fit
          de um país relevante ganha um monitor Exa automático a cada 15 dias (lançamentos,
          promoção, feiras, eventos, menções, notícias) via webhook no Render. O restante usa
          Atualizar sinais. Uma linha dump não confirma compra.
        </p>
      </div>
      <MonitorPanel />
      <LeadsBoard records={records} postgres={db.postgres && !db.error} error={db.error} />
    </main>
  )
}

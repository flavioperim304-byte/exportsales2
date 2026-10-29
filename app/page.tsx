import { Suspense } from "react"
import { connection } from "next/server"
import { Dashboard } from "@/components/dashboard"
import { keyFlags } from "@/lib/keys"
import { summarize } from "@/lib/summary"
import { getRun, listRuns } from "@/lib/store"

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Opening the dashboard…</p>
        </main>
      }
    >
      <Home searchParams={searchParams} />
    </Suspense>
  )
}

async function Home({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  await connection()
  const { run: requested } = await searchParams
  const runs = listRuns()
  const latestLive = runs.find((run) => run.mode !== "sample")
  const selected = (requested && getRun(requested)) || latestLive || runs[0]
  const flags = keyFlags()
  const sourcesReady = [flags.exa, flags.firecrawl, flags.openai, flags.parallel].filter(Boolean).length
  if (!selected) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <p className="text-sm text-muted-foreground">No qualification is on the desk yet.</p>
      </main>
    )
  }
  return (
    <Dashboard
      initialRun={selected}
      runs={runs.filter((run) => run.mode !== "sample")}
      summaries={runs.map(summarize)}
      sourcesReady={sourcesReady}
    />
  )
}

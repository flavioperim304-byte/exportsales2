import { Suspense } from "react"
import { connection } from "next/server"
import { DeskHome } from "@/components/desk-home"
import { keyFlags } from "@/lib/keys"
import { summarize } from "@/lib/summary"
import { listRuns } from "@/lib/store"

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Opening the desk…</p>
        </main>
      }
    >
      <Home />
    </Suspense>
  )
}

async function Home() {
  await connection()
  const runs = listRuns().map(summarize)
  const flags = keyFlags()
  const sourcesReady = [flags.exa, flags.firecrawl, flags.parallel].filter(Boolean).length
  return <DeskHome runs={runs} sourcesReady={sourcesReady} />
}

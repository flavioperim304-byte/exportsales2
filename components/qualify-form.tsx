"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PromptPreview } from "@/components/prompt-preview"
import { CADIVEU_COMPETITOR_BRIEF, EXAMPLE_BRIEF, KANECHOM_BRIEF, LQ_BRIEF, emptyBrief, presentBrief } from "@/lib/example"
import { formatWhen } from "@/lib/format"
import { LEADS_PER_COUNTRY, targetCountries } from "@/lib/prompts"
import type { SavedPrompt } from "@/lib/prompt-library"
import type { Brief, KeyFlags } from "@/lib/types"

export function QualifyForm({
  initial,
  compact = false,
  onStarted,
}: {
  initial?: Brief
  compact?: boolean
  onStarted?: (id: string) => void
}) {
  const router = useRouter()
  const [brief, setBrief] = useState<Brief>(() => presentBrief(initial ?? emptyBrief()))
  const [flags, setFlags] = useState<KeyFlags | null>(null)
  const [saved, setSaved] = useState<SavedPrompt[]>([])
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    fetch("/api/keys")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { flags: KeyFlags } | null) => {
        if (data?.flags) setFlags(data.flags)
      })
      .catch(() => undefined)
    void loadSaved()
  }, [])

  async function loadSaved() {
    const response = await fetch("/api/prompts", { cache: "no-store" }).catch(() => null)
    if (!response?.ok) return
    const data = (await response.json()) as { prompts?: SavedPrompt[] }
    setSaved(data.prompts ?? [])
  }

  function set<K extends keyof Brief>(key: K, value: Brief[K]) {
    setBrief((current) => ({ ...current, [key]: value }))
  }

  async function launch(payload: Brief) {
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !data.id) {
        setError(data.error || "The qualification could not be started.")
        setPending(false)
        return
      }
      void loadSaved()
      if (onStarted) {
        onStarted(data.id)
        setPending(false)
        return
      }
      router.push(`/runs/${data.id}`)
    } catch {
      setError("The desk could not start the pipeline.")
      setPending(false)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    void launch(presentBrief(brief))
  }

  async function savePrompt() {
    setError("")
    setNotice("")
    const response = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(presentBrief(brief)),
    }).catch(() => null)
    const data = (await response?.json().catch(() => null)) as { error?: string } | null
    if (!response?.ok) {
      setError(data?.error || "The prompt could not be saved.")
      return
    }
    setNotice("Prompt saved. Use it on a later search, or leave it unused.")
    await loadSaved()
  }

  const exaReady = flags?.exa ?? false

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {compact ? null : <h1 className="font-serif text-4xl">New qualification</h1>}
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Find buyers for your brand, or map who already distributes a Brazilian brand and the
            direct competitors in each country. Exa Deep is the faster pass. Exa Ultra builds the
            longer list, and Parallel checks it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setBrief(presentBrief(KANECHOM_BRIEF))}>
            Load Kanechom
          </Button>
          <Button type="button" variant="outline" onClick={() => setBrief(presentBrief(LQ_BRIEF))}>
            Load LQ Professional
          </Button>
          <Button type="button" variant="outline" onClick={() => setBrief(presentBrief(EXAMPLE_BRIEF))}>
            Load the coffee example
          </Button>
          <Button type="button" variant="outline" onClick={() => setBrief(presentBrief(CADIVEU_COMPETITOR_BRIEF))}>
            Load Cadiveu competitors
          </Button>
        </div>
      </div>

      <div className={compact ? "grid gap-6" : "grid gap-6 lg:grid-cols-2"}>
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-serif text-2xl">{brief.searchKind === "competitors" ? "Brand" : "Supplier"}</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={brief.searchKind === "competitors" ? "outline" : "default"}
              onClick={() => set("searchKind", "buyers")}
            >
              Find buyers
            </Button>
            <Button
              type="button"
              variant={brief.searchKind === "competitors" ? "default" : "outline"}
              onClick={() => set("searchKind", "competitors")}
            >
              Competitor distributors
            </Button>
          </div>
          <Field label={brief.searchKind === "competitors" ? "Brand" : "Trade name"} htmlFor="supplierName">
            <Input
              id="supplierName"
              value={brief.supplierName}
              onChange={(event) => set("supplierName", event.target.value)}
              className="h-10"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Origin country" htmlFor="originCountry">
              <Input
                id="originCountry"
                value={brief.originCountry}
                onChange={(event) => set("originCountry", event.target.value)}
                className="h-10"
                required
              />
            </Field>
            <Field
              label="Website"
              htmlFor="website"
              hint={
                brief.searchKind === "competitors"
                  ? "Used to drop the brand’s own site."
                  : "Used to drop the supplier from the buyer list."
              }
            >
              <Input
                id="website"
                value={brief.website}
                onChange={(event) => set("website", event.target.value)}
                className="h-10"
                placeholder="https://"
              />
            </Field>
          </div>
          {brief.searchKind === "competitors" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Countries to cover" htmlFor="countryCount" hint="Exa picks this many, unless you name them.">
                  <Input
                    id="countryCount"
                    type="number"
                    min={1}
                    max={8}
                    value={brief.countryCount ?? 5}
                    onChange={(event) => set("countryCount", Number(event.target.value))}
                    className="h-10"
                  />
                </Field>
                <Field label="Exa" htmlFor="exaEffort" hint="Ultra is the thorough list. Deep is faster.">
                  <select
                    id="exaEffort"
                    value={brief.exaEffort ?? "ultra"}
                    onChange={(event) => set("exaEffort", event.target.value === "deep" ? "deep" : "ultra")}
                    className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="ultra">Ultra</option>
                    <option value="deep">Deep</option>
                  </select>
                </Field>
              </div>
              <Field label="Countries to leave out" htmlFor="excludedMarkets" hint="Comma separated. Example: Ecuador, Colombia, India.">
                <Input
                  id="excludedMarkets"
                  value={brief.excludedMarkets ?? ""}
                  onChange={(event) => set("excludedMarkets", event.target.value)}
                  className="h-10"
                />
              </Field>
              <Field label="Only these countries" htmlFor="markets" hint="Leave blank to let Exa choose the countries.">
                <Input
                  id="markets"
                  value={brief.markets}
                  onChange={(event) => set("markets", event.target.value)}
                  className="h-10"
                />
              </Field>
            </>
          ) : (
            <Field
              label="Target markets"
              htmlFor="markets"
              hint={`Comma separated countries. ${LEADS_PER_COUNTRY} leads in each.`}
            >
              <Input
                id="markets"
                value={brief.markets}
                onChange={(event) => set("markets", event.target.value)}
                className="h-10"
                required
              />
            </Field>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-serif text-2xl">Prompt</h2>
          <Field
            label="Prompt"
            htmlFor="instructions"
            hint="Up to 8,000 characters. Anything longer is cut. The company cards sent to Parallel stay in the request, so a long prompt does not push them out."
          >
            <Textarea
              id="instructions"
              value={brief.instructions ?? ""}
              onChange={(event) => set("instructions", event.target.value)}
              className="min-h-48"
              required
              placeholder="Find distributors, wholesalers, and trading companies that import retail hair care. Skip ecommerce shops."
            />
          </Field>
          <Field
            label="Parallel"
            htmlFor="parallelMode"
            hint="Task is the default. Decisions runs only when you pick it for this search."
          >
            <select
              id="parallelMode"
              value={brief.parallelMode === "decisions" ? "decisions" : "task"}
              onChange={(event) => set("parallelMode", event.target.value === "decisions" ? "decisions" : "task")}
              className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <option value="task">Task</option>
              <option value="decisions">Decisions</option>
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => void savePrompt()}>
              Save prompt
            </Button>
            <p className="text-sm text-muted-foreground">
              {targetCountries(brief).length === 0
                ? `Add countries to size the run. Each one asks Exa for ${LEADS_PER_COUNTRY} companies.`
                : `${targetCountries(brief).length} ${targetCountries(brief).length === 1 ? "country" : "countries"} × ${LEADS_PER_COUNTRY} leads = ${targetCountries(brief).length * LEADS_PER_COUNTRY} company reads.`}
            </p>
          </div>
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          {saved.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Saved prompts</p>
              {saved.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{formatWhen(item.createdAt)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 px-3"
                    onClick={() => setBrief(presentBrief(item.brief))}
                  >
                    Use
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Saved prompts stay here. Use one on another search, or leave it unused.
            </p>
          )}
        </section>
      </div>

      {compact ? (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Prompts for this input</summary>
          <div className="mt-4">
            <PromptPreview brief={brief} bare />
          </div>
        </details>
      ) : (
        <PromptPreview brief={brief} />
      )}

      {flags && !exaReady ? (
        <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
          Exa is not connected. Open Sources and add a key, or read the worked example on the desk.
          Firecrawl and Parallel can be added later. Those stages are skipped when their keys are missing, and the score says so.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-10 px-4" disabled={pending || flags === null || !exaReady}>
          {pending ? "Starting the pipeline…" : "Run the pipeline"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {brief.parallelMode === "decisions"
            ? "This run uses Parallel Decisions in fast mode. Other runs stay on the Task API."
            : brief.searchKind === "competitors" && brief.exaEffort !== "deep"
              ? "Exa Ultra can take about 15 minutes. Parallel Task then checks the distributors. You can leave the run open."
              : "Parallel uses the Task API on pro-fast, about $0.14 a call. You can leave the run open while it researches."}
        </p>
      </div>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PromptPreview } from "@/components/prompt-preview"
import { EXAMPLE_BRIEF, KANECHOM_BRIEF, LQ_BRIEF, emptyBrief, presentBrief } from "@/lib/example"
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
            Exa Agent searches, Firecrawl Agent collects ICP fields and contacts, OpenAI scores
            best fit, and Parallel deep research refines it. Prompts rebuild as you type, with{" "}
            {LEADS_PER_COUNTRY} leads in each country.
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
        </div>
      </div>

      <div className={compact ? "grid gap-6" : "grid gap-6 lg:grid-cols-2"}>
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-serif text-2xl">Supplier</h2>
          <Field label="Trade name" htmlFor="supplierName">
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
            <Field label="Website" htmlFor="website" hint="Used to drop the supplier from the buyer list.">
              <Input
                id="website"
                value={brief.website}
                onChange={(event) => set("website", event.target.value)}
                className="h-10"
                placeholder="https://"
              />
            </Field>
          </div>
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
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-serif text-2xl">Prompt</h2>
          <Field
            label="Prompt"
            htmlFor="instructions"
            hint="Products, buyer types, must-haves, and exclusions go in this text. Exa, Firecrawl, OpenAI, and Parallel receive it."
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
          Parallel pro-fast is the slow step. You can leave the run open while it researches.
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

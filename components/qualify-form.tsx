"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EXAMPLE_BRIEF, emptyBrief } from "@/lib/example"
import type { Brief, KeyFlags } from "@/lib/types"

export function QualifyForm() {
  const router = useRouter()
  const [brief, setBrief] = useState<Brief>(emptyBrief())
  const [flags, setFlags] = useState<KeyFlags | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    fetch("/api/keys")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { flags: KeyFlags } | null) => {
        if (data?.flags) setFlags(data.flags)
      })
      .catch(() => undefined)
  }, [])

  function set<K extends keyof Brief>(key: K, value: Brief[K]) {
    setBrief((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      })
      const data = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !data.id) {
        setError(data.error || "The qualification could not be started.")
        setPending(false)
        return
      }
      router.push(`/runs/${data.id}`)
    } catch {
      setError("The desk could not start the pipeline.")
      setPending(false)
    }
  }

  const exaReady = flags?.exa ?? false

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl">New qualification</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The supplier is the company you are selling. The ICP is who should buy. A live run
            calls Exa, then Firecrawl once per lead, then one Parallel deep-research task.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setBrief({ ...EXAMPLE_BRIEF })}
        >
          Load the coffee example
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
          <Field label="Products you export" htmlFor="products">
            <Textarea
              id="products"
              value={brief.products}
              onChange={(event) => set("products", event.target.value)}
              required
            />
          </Field>
          <Field label="Why a buyer would add you" htmlFor="differentiators">
            <Textarea
              id="differentiators"
              value={brief.differentiators}
              onChange={(event) => set("differentiators", event.target.value)}
            />
          </Field>
          <Field label="Certifications" htmlFor="certifications" hint="Comma separated.">
            <Input
              id="certifications"
              value={brief.certifications}
              onChange={(event) => set("certifications", event.target.value)}
              className="h-10"
            />
          </Field>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-serif text-2xl">Ideal buyer</h2>
          <Field label="Target markets" htmlFor="markets" hint="Comma separated countries.">
            <Input
              id="markets"
              value={brief.markets}
              onChange={(event) => set("markets", event.target.value)}
              className="h-10"
              required
            />
          </Field>
          <Field label="Buyer types" htmlFor="buyerTypes">
            <Textarea
              id="buyerTypes"
              value={brief.buyerTypes}
              onChange={(event) => set("buyerTypes", event.target.value)}
              required
            />
          </Field>
          <Field label="Must-haves" htmlFor="mustHaves">
            <Textarea
              id="mustHaves"
              value={brief.mustHaves}
              onChange={(event) => set("mustHaves", event.target.value)}
            />
          </Field>
          <Field label="Exclusions" htmlFor="exclusions" hint="A matching phrase disqualifies the lead.">
            <Textarea
              id="exclusions"
              value={brief.exclusions}
              onChange={(event) => set("exclusions", event.target.value)}
            />
          </Field>
          <Field label="How many leads" htmlFor="leadCount" hint="4 to 8. Each one is a Firecrawl read.">
            <Input
              id="leadCount"
              type="number"
              min={4}
              max={8}
              value={brief.leadCount}
              onChange={(event) => set("leadCount", Number(event.target.value))}
              className="h-10"
            />
          </Field>
        </section>
      </div>

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

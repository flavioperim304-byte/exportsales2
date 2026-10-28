"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { KeyFlags } from "@/lib/types"

const EMPTY_FLAGS: KeyFlags = {
  exa: false,
  firecrawl: false,
  openai: false,
  parallel: false,
  exaEnv: false,
  firecrawlEnv: false,
  openaiEnv: false,
  parallelEnv: false,
}

export function SourcesForm() {
  const [flags, setFlags] = useState<KeyFlags>(EMPTY_FLAGS)
  const [exa, setExa] = useState("")
  const [firecrawl, setFirecrawl] = useState("")
  const [openai, setOpenai] = useState("")
  const [parallel, setParallel] = useState("")
  const [notes, setNotes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  async function refresh() {
    const response = await fetch("/api/keys")
    if (!response.ok) return
    const data = (await response.json()) as { flags: KeyFlags }
    setFlags(data.flags)
  }

  useEffect(() => {
    let cancelled = false
    fetch("/api/keys")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { flags: KeyFlags } | null) => {
        if (!cancelled && data?.flags) setFlags(data.flags)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setNotes([])
    setSaved(false)
    const payload: Record<string, string> = {}
    if (exa.trim()) payload.exa = exa.trim()
    if (firecrawl.trim()) payload.firecrawl = firecrawl.trim()
    if (openai.trim()) payload.openai = openai.trim()
    if (parallel.trim()) payload.parallel = parallel.trim()
    if (Object.keys(payload).length === 0) {
      setError("Paste at least one key before saving.")
      setSaving(false)
      return
    }
    try {
      const response = await fetch("/api/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as { flags?: KeyFlags; notes?: string[]; error?: string }
      if (!response.ok) {
        setError(data.error || "The keys could not be saved.")
        return
      }
      if (data.flags) setFlags(data.flags)
      setNotes(data.notes ?? [])
      setExa("")
      setFirecrawl("")
      setOpenai("")
      setParallel("")
      setSaved(true)
    } catch {
      setError("The desk could not reach its own key store.")
    } finally {
      setSaving(false)
    }
  }

  async function clearKey(field: "exa" | "firecrawl" | "openai" | "parallel") {
    setError("")
    setSaved(false)
    const response = await fetch("/api/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: "" }),
    })
    const data = (await response.json()) as { flags?: KeyFlags; notes?: string[] }
    if (data.flags) setFlags(data.flags)
    setNotes(data.notes ?? [])
    await refresh()
  }

  const ready = [flags.exa, flags.firecrawl, flags.openai, flags.parallel].filter(Boolean).length

  return (
    <form onSubmit={save} className="flex max-w-xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {ready} of 4 sources connected. Keys stay in <span className="font-medium text-foreground">data/secrets.json</span> on this machine and are sent only to Exa, Firecrawl, OpenAI, and Parallel.
      </p>
      <KeyField
        id="exa-key"
        label="Exa"
        hint="Agent in search mode. Finds 10 companies per country. Required for a live run."
        env={flags.exaEnv}
        saved={flags.exa}
        value={exa}
        onChange={setExa}
        onClear={() => clearKey("exa")}
      />
      <KeyField
        id="firecrawl-key"
        label="Firecrawl"
        hint="Agent that collects ICP fields plus email, website, phone, and WhatsApp."
        env={flags.firecrawlEnv}
        saved={flags.firecrawl}
        value={firecrawl}
        onChange={setFirecrawl}
        onClear={() => clearKey("firecrawl")}
      />
      <KeyField
        id="openai-key"
        label="OpenAI"
        hint="Scores each company and names a preliminary best fit."
        env={flags.openaiEnv}
        saved={flags.openai}
        value={openai}
        onChange={setOpenai}
        onClear={() => clearKey("openai")}
      />
      <KeyField
        id="parallel-key"
        label="Parallel"
        hint="Deep research. Refines the OpenAI score, adds market context, and sets the final best fit."
        env={flags.parallelEnv}
        saved={flags.parallel}
        value={parallel}
        onChange={setParallel}
        onClear={() => clearKey("parallel")}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm">Keys saved. A new qualification will use them.</p> : null}
      {notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
      <Button type="submit" disabled={saving} className="h-10 w-fit px-4">
        {saving ? "Saving…" : "Save keys"}
      </Button>
    </form>
  )
}

function KeyField({
  id,
  label,
  hint,
  env,
  saved,
  value,
  onChange,
  onClear,
}: {
  id: string
  label: string
  hint: string
  env: boolean
  saved: boolean
  value: string
  onChange: (value: string) => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {env || saved ? "Connected" : "Not connected"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {env ? (
        <p className="text-sm">Using the environment variable for this source.</p>
      ) : (
        <>
          <Input
            id={id}
            type="password"
            autoComplete="off"
            value={value}
            placeholder={saved ? "Key saved — paste a replacement" : "Paste API key"}
            onChange={(event) => onChange(event.target.value)}
            className="h-10"
          />
          {saved ? (
            <button
              type="button"
              onClick={onClear}
              className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Remove saved key
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

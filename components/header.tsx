"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { KeyFlags } from "@/lib/types"

const EMPTY_FLAGS: KeyFlags = {
  exa: false,
  firecrawl: false,
  parallel: false,
  exaEnv: false,
  firecrawlEnv: false,
  parallelEnv: false,
}

export function Header() {
  const [open, setOpen] = useState(false)
  const [flags, setFlags] = useState<KeyFlags>(EMPTY_FLAGS)
  const [exa, setExa] = useState("")
  const [firecrawl, setFirecrawl] = useState("")
  const [parallel, setParallel] = useState("")
  const [notes, setNotes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

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

  const ready = [flags.exa, flags.firecrawl, flags.parallel].filter(Boolean).length

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setNotes([])
    const payload: Record<string, string> = {}
    if (exa.trim()) payload.exa = exa.trim()
    if (firecrawl.trim()) payload.firecrawl = firecrawl.trim()
    if (parallel.trim()) payload.parallel = parallel.trim()
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
      setParallel("")
    } catch {
      setError("The desk could not reach its own key store.")
    } finally {
      setSaving(false)
    }
  }

  async function clearKey(field: "exa" | "firecrawl" | "parallel") {
    setError("")
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

  return (
    <header className="border-b border-border/80 bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="min-w-0">
          <span className="font-serif text-xl tracking-tight text-foreground">Meridian</span>
          <span className="mt-0.5 block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Export desk
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" render={<Link href="/qualify" />}>
            New qualification
          </Button>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Sources {ready}/3
          </Button>
        </nav>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-serif text-xl">Sources</SheetTitle>
            <SheetDescription>
              Keys stay in a local file on this machine and are sent only to Exa, Firecrawl, and Parallel.
              Environment variables take precedence over anything saved here.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={save} className="flex flex-col gap-4 px-4 pb-6">
            <KeyField
              id="exa-key"
              label="Exa"
              hint="Search and enrichment"
              env={flags.exaEnv}
              saved={flags.exa}
              value={exa}
              onChange={setExa}
              onClear={() => clearKey("exa")}
            />
            <KeyField
              id="firecrawl-key"
              label="Firecrawl"
              hint="Page extraction"
              env={flags.firecrawlEnv}
              saved={flags.firecrawl}
              value={firecrawl}
              onChange={setFirecrawl}
              onClear={() => clearKey("firecrawl")}
            />
            <KeyField
              id="parallel-key"
              label="Parallel"
              hint="Deep research on leads, competitors, and the market"
              env={flags.parallelEnv}
              saved={flags.parallel}
              value={parallel}
              onChange={setParallel}
              onClear={() => clearKey("parallel")}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {notes.map((note) => (
              <p key={note} className="text-sm text-muted-foreground">
                {note}
              </p>
            ))}
            <Button type="submit" disabled={saving} className="h-10">
              {saving ? "Saving…" : "Save keys"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </header>
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
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

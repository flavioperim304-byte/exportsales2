"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { KeyFlags } from "@/lib/types"

export function Header() {
  const [ready, setReady] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch("/api/keys")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { flags: KeyFlags } | null) => {
        if (cancelled || !data?.flags) return
        const count = [data.flags.exa, data.flags.firecrawl, data.flags.openai, data.flags.parallel].filter(Boolean).length
        setReady(count)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <header className="border-b border-border/80 bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="min-w-0">
          <span className="font-serif text-xl tracking-tight text-foreground">Export desk</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" nativeButton={false} render={<Link href="/" />}>
            Dashboard
          </Button>
          <Button variant="ghost" nativeButton={false} render={<Link href="/qualify" />}>
            Full form
          </Button>
          <Button
            variant={ready === 0 ? "default" : "outline"}
            nativeButton={false}
            render={<Link href="/sources" />}
          >
            Sources {ready}/4
          </Button>
        </nav>
      </div>
    </header>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export const EXA_WEBHOOK_URL = "https://exportsales.onrender.com/api/exa/webhook"

export function WebhookLine({ compact = false }: { compact?: boolean }) {
  const [url, setUrl] = useState(EXA_WEBHOOK_URL)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/monitors", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { webhookUrl?: string } | null) => {
        if (!cancelled && data?.webhookUrl) setUrl(data.webhookUrl)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className={compact ? "" : "rounded-xl border border-border bg-card p-4"}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Webhook Exa · Painel
      </p>
      <p className="mt-1 break-all font-mono text-xs sm:text-sm">{url}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Destino POST no serviço Render <span className="text-foreground">exportsales</span>. Não
        aparece em Integrations → Webhooks. A Exa envia; não é para abrir no browser.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={() => void copy()}>
          {copied ? "Copiado" : "Copiar URL"}
        </Button>
      </div>
    </section>
  )
}

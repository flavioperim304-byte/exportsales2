"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type FilingRow = {
  id: string
  importer: string
  country: string
  hs: string
  hsShipments: number
  lastTradeDate?: string
  cargoLabel: string
  quality: string
  qualityLabel: string
  occupiedBrands: string[]
  occupiedShare: number
  logisticsShare: number
  brazilHint: boolean
  partners: { name: string; sharePct?: number; kind: string }[]
  description: string
  sourceFile?: string
  hsCodes?: { code: string; shipments: number }[]
  tradingCountries?: string[]
  ports?: string[]
  originsRedacted?: boolean
  portsRedacted?: boolean
  partnersRedacted?: boolean
  headingOnly?: boolean
}

type Payload = {
  count?: number
  seedCount?: number
  filings?: FilingRow[]
  added?: number
  parsed?: number
  rematched?: number
  summary?: {
    candidates: number
    excluded: number
    countries: { country: string; count: number; candidates: number }[]
    files: string[]
  }
  files?: { name: string; parsed: number; added: number }[]
  error?: string
}

export function TradeForm() {
  const [text, setText] = useState("")
  const [rows, setRows] = useState<FilingRow[]>([])
  const [seedCount, setSeedCount] = useState(0)
  const [count, setCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [summary, setSummary] = useState<Payload["summary"]>()

  async function refresh() {
    const response = await fetch("/api/trade-records")
    if (!response.ok) return
    const data = (await response.json()) as Payload
    setRows(data.filings ?? [])
    setCount(data.count ?? 0)
    setSeedCount(data.seedCount ?? 0)
    setSummary(data.summary)
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setNote("")
    try {
      const response = await fetch("/api/trade-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      const data = (await response.json()) as Payload
      if (!response.ok) {
        setError(data.error || "O arquivo não pôde ser lido.")
        return
      }
      setText("")
      const files = data.files?.map((item) => `${item.name}: ${item.parsed}`).join(" · ")
      setNote(
        `Li ${data.parsed} empresas. ${data.added} novas no arquivo. Cruzei ${data.rematched} buscas já na mesa.${files ? ` ${files}.` : ""} ${data.summary ? `${data.summary.candidates} candidatos para a busca dump.` : ""}`
      )
      await refresh()
    } catch {
      setError("O desk não alcançou o arquivo de aduana.")
    } finally {
      setSaving(false)
    }
  }

  async function onFile(list: FileList | null) {
    if (!list?.length) return
    if (list.length === 1) {
      setText(await list[0].text())
      return
    }
    setSaving(true)
    setError("")
    setNote("")
    try {
      const files = await Promise.all(
        [...list].map(async (file) => ({ name: file.name, text: await file.text() }))
      )
      const response = await fetch("/api/trade-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      })
      const data = (await response.json()) as Payload
      if (!response.ok) {
        setError(data.error || "O arquivo não pôde ser lido.")
        return
      }
      const names = data.files?.map((item) => `${item.name}: ${item.parsed}`).join(" · ")
      setNote(
        `Li ${data.parsed} empresas em ${files.length} arquivos. ${data.added} novas. ${names || ""} ${data.summary ? `${data.summary.candidates} candidatos para a busca dump.` : ""}`
      )
      await refresh()
    } catch {
      setError("O desk não alcançou o arquivo de aduana.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {count} importadores no arquivo
          {seedCount ? ` · ${seedCount} do dump Panamá HS 330510 (agosto, sem assinatura)` : ""}.
          {summary
            ? ` ${summary.candidates} candidatos para Dump + API; ${summary.excluded} logística/marca global/ruído.`
            : ""}{" "}
          Há falsos. A busca dump manda os nomes para Exa e Firecrawl confirmarem. Logística e marcas
          globais ficam de fora.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="trade-file">CSV ou dump</Label>
          <input
            id="trade-file"
            type="file"
            accept=".txt,.csv,.tsv,text/plain,text/csv"
            multiple
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5"
            onChange={(event) => void onFile(event.target.files)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="trade-text">Cole as fichas</Label>
          <Textarea
            id="trade-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            placeholder={"AGENCIA Y. MERCADEO S.A.\nPanama Importer\nLast Trade Date: 2026-06-29\n..."}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {note ? <p className="text-sm">{note}</p> : null}
        <Button type="submit" disabled={saving || !text.trim()} className="w-fit">
          {saving ? "Normalizando…" : "Normalizar e cruzar com as leads"}
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum embarque ainda. Cole um dump para começar.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Importador</th>
                <th className="py-2 pr-3 font-medium">HS</th>
                <th className="py-2 pr-3 font-medium">Embarques</th>
                <th className="py-2 pr-3 font-medium">Último</th>
                <th className="py-2 pr-3 font-medium">Qualidade</th>
                <th className="py-2 pr-3 font-medium">Parceiros</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/70 align-top">
                  <td className="py-3 pr-3">
                    <p className="font-medium">{row.importer}</p>
                    <p className="text-muted-foreground">
                      {row.country}
                      {row.brazilHint ? " · origem Brasil no texto" : ""}
                    </p>
                    {row.description ? (
                      <p className="mt-1 max-w-xs text-muted-foreground">{row.description}</p>
                    ) : null}
                    {row.originsRedacted || row.portsRedacted || row.partnersRedacted || row.headingOnly ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[
                          row.partnersRedacted ? "parceiros ***" : "",
                          row.originsRedacted ? "origem ***" : "",
                          row.portsRedacted ? "portos ***" : "",
                          row.headingOnly ? "texto do HS, não do produto" : "",
                          row.tradingCountries?.length ? `visível: ${row.tradingCountries.join(", ")}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">
                    {row.hs}
                    {row.hsCodes && row.hsCodes.length > 1 ? (
                      <p className="text-xs">
                        {row.hsCodes
                          .slice(0, 4)
                          .map((item) => item.code)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3">{row.hsShipments.toLocaleString("pt-BR")}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{row.lastTradeDate?.slice(0, 10) || "—"}</td>
                  <td className="py-3 pr-3">
                    <p>{row.qualityLabel}</p>
                    <p className="text-muted-foreground">{row.cargoLabel}</p>
                    {row.occupiedBrands.length ? (
                      <p className="text-muted-foreground">{row.occupiedBrands.join(", ")}</p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">
                    {row.partners.length === 0
                      ? "—"
                      : row.partners
                          .map((partner) =>
                            partner.sharePct != null ? `${partner.name} ${partner.sharePct}%` : partner.name
                          )
                          .join(" · ")}
                    {row.logisticsShare >= 50 ? ` · logística ${row.logisticsShare}%` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

import { connection } from "next/server"
import { rematchFilingsOnRuns } from "@/lib/pipeline"
import { cargoLabel, filingSummary, qualityLabel } from "@/lib/trade-records"
import { addFilingFiles, addFilings, listFilings, seedFilingCount } from "@/lib/trade-store"

export const maxDuration = 60

function present(row: Awaited<ReturnType<typeof listFilings>>[number]) {
  return {
    id: row.id,
    importer: row.importer,
    country: row.country,
    hs: row.hs,
    hsShipments: row.hsShipments,
    totalShipments: row.totalShipments,
    lastTradeDate: row.lastTradeDate,
    cargo: row.cargo,
    cargoLabel: cargoLabel(row.cargo),
    quality: row.quality,
    qualityLabel: qualityLabel(row.quality),
    occupiedBrands: row.occupiedBrands,
    occupiedShare: row.occupiedShare,
    logisticsShare: row.logisticsShare,
    brazilHint: row.brazilHint,
    partners: row.partners.slice(0, 5).map((partner) => ({
      name: partner.canonical || partner.name,
      sharePct: partner.sharePct,
      kind: partner.kind,
    })),
    description: row.description,
    sourceFile: row.sourceFile || "",
    hsCodes: row.hsCodes,
    tradingCountries: row.tradingCountries,
    ports: row.ports,
    originsRedacted: row.originsRedacted,
    portsRedacted: row.portsRedacted,
    note: `${row.hsShipments} HS ${row.hs}`,
  }
}

export async function GET() {
  await connection()
  const filings = await listFilings()
  const summary = filingSummary(filings)
  return Response.json({
    count: filings.length,
    seedCount: seedFilingCount(),
    source: "trade dump / CSV (indicação, há falsos)",
    summary,
    filings: filings
      .slice()
      .sort((a, b) => b.hsShipments - a.hsShipments)
      .map(present),
  })
}

export async function POST(request: Request) {
  await connection()
  const contentType = request.headers.get("content-type") || ""
  let text = ""
  let sourceFile = ""
  let files: { name: string; text: string }[] = []
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData()
    const pasted = form.get("text")
    if (typeof pasted === "string") text = pasted
    const named = form.get("sourceFile")
    if (typeof named === "string") sourceFile = named
    const uploaded = form.getAll("file").concat(form.getAll("files"))
    for (const item of uploaded) {
      if (item && typeof item === "object" && "text" in item) {
        const file = item as File
        files.push({ name: file.name, text: await file.text() })
      }
    }
  } else {
    const body = (await request.json().catch(() => null)) as {
      text?: string
      sourceFile?: string
      files?: { name?: string; text?: string }[]
    } | null
    text = typeof body?.text === "string" ? body.text : ""
    sourceFile = typeof body?.sourceFile === "string" ? body.sourceFile : ""
    files = Array.isArray(body?.files)
      ? body.files
          .filter((item): item is { name: string; text: string } => Boolean(item && item.text))
          .map((item) => ({ name: item.name || "paste.txt", text: item.text }))
      : []
  }
  if (!text.trim() && files.length === 0) {
    return Response.json({ error: "Cole o dump da TradeInData ou envie um CSV." }, { status: 400 })
  }
  try {
    const result =
      files.length > 0
        ? await addFilingFiles(files)
        : await addFilings(text, undefined, sourceFile)
    if (result.parsed.length === 0) {
      return Response.json(
        { error: "Não reconheci empresas neste arquivo. Cole o dump da ficha TradeInData ou um CSV com coluna de importador." },
        { status: 400 }
      )
    }
    const rematched = await rematchFilingsOnRuns()
    return Response.json({
      added: result.added,
      total: result.total,
      parsed: result.parsed.length,
      rematched,
      summary: filingSummary(result.filings),
      files: "files" in result ? result.files : undefined,
      filings: result.parsed
        .slice()
        .sort((a, b) => b.hsShipments - a.hsShipments)
        .map(present),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "The trade file could not be saved."
    return Response.json({ error: message }, { status: 500 })
  }
}

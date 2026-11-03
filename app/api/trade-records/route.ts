import { connection } from "next/server"
import { rematchFilingsOnRuns } from "@/lib/pipeline"
import { cargoLabel, qualityLabel } from "@/lib/trade-records"
import { addFilings, listFilings, seedFilingCount } from "@/lib/trade-store"

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
    note: `${row.hsShipments} HS ${row.hs}`,
  }
}

export async function GET() {
  await connection()
  const filings = await listFilings()
  return Response.json({
    count: filings.length,
    seedCount: seedFilingCount(),
    source: "TradeInData Panama HS 330510 (pasta + uploads)",
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
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData()
    const file = form.get("file")
    const pasted = form.get("text")
    if (typeof pasted === "string") text = pasted
    if (file && typeof file === "object" && "text" in file) {
      text = await (file as File).text()
    }
  } else {
    const body = (await request.json().catch(() => null)) as { text?: string } | null
    text = typeof body?.text === "string" ? body.text : ""
  }
  if (!text.trim()) {
    return Response.json({ error: "Cole o dump da TradeInData ou envie um CSV." }, { status: 400 })
  }
  try {
    const result = await addFilings(text)
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

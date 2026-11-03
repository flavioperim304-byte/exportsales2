import * as XLSX from "xlsx"
import {
  countryFromFilename,
  looksLikeCsv,
  parseTradeCsv,
  parseTradeDump,
  stampFileCountry,
} from "./trade-records"
import type { TradeFiling } from "./types"

function cellText(value: unknown): string {
  if (value == null) return ""
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

function looksLikeDump(text: string): boolean {
  return /\bImporter\b/i.test(text) && /last trade date|description|hscode|total shipment/i.test(text)
}

function looksLikeHeaderRow(cells: string[]): boolean {
  const line = cells.join(",")
  return looksLikeCsv(`${line}\ncompany,1`) || /importer|company|consignee|hscode|hs code|shipment|last trade/i.test(line)
}

function csvFromSheet(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n;]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
          return cell
        })
        .join(",")
    )
    .join("\n")
}

function dumpFromSheet(rows: string[][]): string {
  return rows.map((row) => row.filter(Boolean).join("\n")).filter(Boolean).join("\n")
}

function parseLooseTable(rows: string[][], sourceFile: string): TradeFiling[] {
  const country = countryFromFilename(sourceFile) || "Unknown"
  const lines = ["Importer,Country,HSCODE,Total Shipment,Last Trade Date,Description,Partner"]
  for (const row of rows) {
    const cells = row.filter(Boolean)
    if (cells.length === 0) continue
    const importer = cells[0]
    if (importer.length < 3 || looksLikeHeaderRow([importer])) continue
    const hs = cells.find((cell) => /^\d{4,12}$/.test(cell.replace(/\s/g, ""))) ?? ""
    const date = cells.find((cell) => /^\d{4}-\d{2}-\d{2}/.test(cell)) ?? ""
    const qty = cells.find((cell) => /^\d[\d,.]*$/.test(cell) && cell.replace(/\D/g, "").length <= 8 && cell !== hs) ?? ""
    const description = cells.filter((cell) => cell !== importer && cell !== hs && cell !== date && cell !== qty).join(" | ")
    lines.push(
      [importer, country, hs, qty, date, description, ""]
        .map((cell) => (/,/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(",")
    )
  }
  if (lines.length < 2) return []
  return parseTradeCsv(lines.join("\n"), "csv", sourceFile)
}

function sheetToFilings(rows: string[][], sourceFile: string): TradeFiling[] {
  const cleaned = rows.map((row) => row.map(cellText)).filter((row) => row.some(Boolean))
  if (cleaned.length === 0) return []
  const dumpText = dumpFromSheet(cleaned)
  if (looksLikeDump(dumpText)) {
    const dump = parseTradeDump(dumpText, "tradeindata", sourceFile)
    if (dump.length) return dump
  }
  if (looksLikeHeaderRow(cleaned[0])) {
    const csv = parseTradeCsv(csvFromSheet(cleaned), "csv", sourceFile)
    if (csv.length) return csv
  }
  return parseLooseTable(cleaned, sourceFile)
}

export function parseTradeExcel(buffer: Buffer | Uint8Array, sourceFile: string): TradeFiling[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
  const filings: TradeFiling[] = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][]
    filings.push(...sheetToFilings(rows as string[][], sourceFile))
  }
  return stampFileCountry(filings, sourceFile)
}

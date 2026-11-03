import fs from "node:fs"
import path from "node:path"
import { parseTradeExcel } from "./trade-excel"
import { isExcelName, parseTradeDump, parseTradeInput } from "./trade-records"
import type { TradeFiling } from "./types"

export type TradeUpload = {
  name: string
  text?: string
  buffer?: Buffer
}

function parseUpload(file: TradeUpload): TradeFiling[] {
  if (file.buffer && (isExcelName(file.name) || looksLikeExcelBuffer(file.buffer))) {
    return parseTradeExcel(file.buffer, file.name)
  }
  const text = file.text ?? (file.buffer ? file.buffer.toString("utf8") : "")
  return parseTradeInput(text, undefined, file.name)
}

function looksLikeExcelBuffer(buffer: Buffer): boolean {
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return true
  return buffer.length >= 8 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0
}

const file = path.join(process.cwd(), "data", "trade-records.json")
const seedFile = path.join(process.cwd(), "lib", "data", "panama-shampoo.txt")

type Database = { filings: TradeFiling[]; updatedAt?: string }

let queue: Promise<void> = Promise.resolve()

function readSeed(): TradeFiling[] {
  try {
    const text = fs.readFileSync(seedFile, "utf8")
    return parseTradeDump(text, "tradeindata")
  } catch {
    return []
  }
}

function readDisk(): Database {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Database
    if (!parsed || !Array.isArray(parsed.filings)) return { filings: [] }
    return parsed
  } catch {
    return { filings: [] }
  }
}

function write(db: Database) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db))
  fs.renameSync(tmp, file)
}

function loadDatabase(): Database {
  const disk = readDisk()
  if (disk.filings.length > 0) return disk
  const seed = readSeed()
  if (seed.length === 0) return disk
  const merged: Database = { filings: seed, updatedAt: new Date().toISOString() }
  try {
    write(merged)
  } catch {
    return merged
  }
  return merged
}

export function seedFilingCount(): number {
  return readSeed().length
}

export async function listFilings(): Promise<TradeFiling[]> {
  const job = queue.then(() => loadDatabase().filings)
  queue = job.then(
    () => undefined,
    () => undefined
  )
  return job
}

export async function addFilings(
  text: string,
  source?: TradeFiling["source"],
  sourceFile?: string
): Promise<{
  added: number
  total: number
  filings: TradeFiling[]
  parsed: TradeFiling[]
}> {
  const parsed = parseTradeInput(text, source, sourceFile)
  let added = 0
  let total = 0
  let filings: TradeFiling[] = []
  const job = queue.then(() => {
    const db = loadDatabase()
    const byId = new Map(db.filings.map((row) => [row.id, row]))
    for (const row of parsed) {
      if (!byId.has(row.id)) added += 1
      byId.set(row.id, row)
    }
    db.filings = [...byId.values()]
    db.updatedAt = new Date().toISOString()
    write(db)
    filings = db.filings
    total = db.filings.length
  })
  queue = job.then(
    () => undefined,
    () => undefined
  )
  await job
  return { added, total, filings, parsed }
}

export async function addFilingFiles(files: TradeUpload[]): Promise<{
  added: number
  total: number
  filings: TradeFiling[]
  parsed: TradeFiling[]
  files: { name: string; parsed: number; added: number }[]
}> {
  let added = 0
  let total = 0
  let filings: TradeFiling[] = []
  const parsed: TradeFiling[] = []
  const report: { name: string; parsed: number; added: number }[] = []
  const job = queue.then(() => {
    const db = loadDatabase()
    const byId = new Map(db.filings.map((row) => [row.id, row]))
    for (const file of files) {
      const rows = parseUpload(file)
      let fileAdded = 0
      for (const row of rows) {
        if (!byId.has(row.id)) {
          added += 1
          fileAdded += 1
        }
        byId.set(row.id, row)
        parsed.push(row)
      }
      report.push({ name: file.name, parsed: rows.length, added: fileAdded })
    }
    db.filings = [...byId.values()]
    db.updatedAt = new Date().toISOString()
    write(db)
    filings = db.filings
    total = db.filings.length
  })
  queue = job.then(
    () => undefined,
    () => undefined
  )
  await job
  return { added, total, filings, parsed, files: report }
}

export async function replaceFilings(text: string, source?: TradeFiling["source"]): Promise<{
  added: number
  total: number
  filings: TradeFiling[]
  parsed: TradeFiling[]
}> {
  const parsed = parseTradeInput(text, source)
  const db: Database = { filings: parsed, updatedAt: new Date().toISOString() }
  const job = queue.then(() => {
    write(db)
  })
  queue = job.then(
    () => undefined,
    () => undefined
  )
  await job
  return { added: parsed.length, total: parsed.length, filings: parsed, parsed }
}

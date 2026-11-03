import fs from "node:fs"
import path from "node:path"
import { parseTradeDump, parseTradeInput } from "./trade-records"
import type { TradeFiling } from "./types"

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

export async function addFilings(text: string, source?: TradeFiling["source"]): Promise<{
  added: number
  total: number
  filings: TradeFiling[]
  parsed: TradeFiling[]
}> {
  const parsed = parseTradeInput(text, source)
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

import fs from "node:fs"
import path from "node:path"
import { SAMPLE_RUN_ID } from "./ids"
import { sampleRun } from "./sample"
import type { Run } from "./types"

const file = path.join(process.cwd(), "data", "runs.json")

type Database = { runs: Run[] }

let queue: Promise<void> = Promise.resolve()

function read(): Database {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Database
    if (!parsed || !Array.isArray(parsed.runs)) return { runs: [] }
    return parsed
  } catch {
    return { runs: [] }
  }
}

function write(db: Database) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db))
  fs.renameSync(tmp, file)
}

export function listRuns(): Run[] {
  const stored = read().runs.filter((run) => run.id !== SAMPLE_RUN_ID)
  stored.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return [sampleRun(), ...stored]
}

export function getRun(id: string): Run | null {
  if (id === SAMPLE_RUN_ID) return sampleRun()
  return read().runs.find((run) => run.id === id) ?? null
}

export async function insertRun(run: Run): Promise<void> {
  const job = queue.then(() => {
    const db = read()
    db.runs = db.runs.filter((item) => item.id !== run.id)
    db.runs.unshift(run)
    write(db)
  })
  queue = job.then(
    () => undefined,
    () => undefined
  )
  await job
}

export async function updateRun<T>(
  id: string,
  fn: (run: Run) => T
): Promise<T | null> {
  if (id === SAMPLE_RUN_ID) return null
  let result: T | null = null
  let failed: unknown
  const job = queue.then(() => {
    const db = read()
    const run = db.runs.find((item) => item.id === id)
    if (!run) return
    try {
      result = fn(run)
      run.updatedAt = new Date().toISOString()
      write(db)
    } catch (error) {
      failed = error
    }
  })
  queue = job.then(
    () => undefined,
    () => undefined
  )
  await job
  if (failed) throw failed
  return result
}

import fs from "node:fs"
import path from "node:path"
import { getStore } from "@netlify/blobs"
import { SAMPLE_RUN_ID } from "./ids"
import { sampleRun } from "./sample"
import type { Run } from "./types"

function durable(): boolean {
  return process.env.NETLIFY === "true" && process.env.NEXT_PHASE !== "phase-production-build"
}

function blobs() {
  return getStore({ name: "export-desk", consistency: "strong" })
}

async function blobGet(id: string): Promise<Run | null> {
  try {
    const value = await blobs().get(`run:${id}`, { type: "json", consistency: "strong" })
    if (!value || typeof value !== "object") return null
    return value as Run
  } catch {
    return null
  }
}

async function blobList(): Promise<Run[]> {
  try {
    const store = blobs()
    const listed = await store.list({ prefix: "run:" })
    const runs: Run[] = []
    for (const blob of listed.blobs) {
      const value = await store.get(blob.key, { type: "json", consistency: "strong" })
      if (value && typeof value === "object") runs.push(value as Run)
    }
    return runs
  } catch {
    return []
  }
}

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

export async function listRuns(): Promise<Run[]> {
  const stored = (durable() ? await blobList() : read().runs).filter((run) => run.id !== SAMPLE_RUN_ID)
  stored.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return [sampleRun(), ...stored]
}

export async function getRun(id: string): Promise<Run | null> {
  if (id === SAMPLE_RUN_ID) return sampleRun()
  if (durable()) return blobGet(id)
  return read().runs.find((run) => run.id === id) ?? null
}

export async function insertRun(run: Run): Promise<void> {
  const job = queue.then(async () => {
    if (durable()) {
      await blobs().setJSON(`run:${run.id}`, run)
      return
    }
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
  const job = queue.then(async () => {
    try {
      const run = durable() ? await blobGet(id) : read().runs.find((item) => item.id === id)
      if (!run) return
      result = fn(run)
      run.updatedAt = new Date().toISOString()
      if (durable()) await blobs().setJSON(`run:${id}`, run)
      else {
        const db = read()
        const index = db.runs.findIndex((item) => item.id === id)
        if (index < 0) return
        db.runs[index] = run
        write(db)
      }
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

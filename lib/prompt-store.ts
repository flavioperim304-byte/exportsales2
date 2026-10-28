import fs from "node:fs"
import path from "node:path"
import { addSavedPrompt, type SavedPrompt } from "./prompt-library"
import type { Brief } from "./types"

const file = path.join(process.cwd(), "data", "prompts.json")

type Database = { prompts: SavedPrompt[] }

function read(): Database {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Database
    if (!parsed || !Array.isArray(parsed.prompts)) return { prompts: [] }
    return parsed
  } catch {
    return { prompts: [] }
  }
}

function write(db: Database) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db))
  fs.renameSync(tmp, file)
}

export function listPrompts(): SavedPrompt[] {
  return read().prompts
}

export function savePrompt(brief: Brief): SavedPrompt | null {
  const text = brief.instructions?.trim()
  if (!text) return null
  const db = read()
  const next = addSavedPrompt(db.prompts, brief, new Date().toISOString(), crypto.randomUUID())
  if (next === db.prompts) return db.prompts.find((item) => item.brief.instructions?.trim() === text) ?? null
  write({ prompts: next })
  return next[0] ?? null
}

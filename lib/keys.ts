import fs from "node:fs"
import path from "node:path"
import type { KeyFlags } from "./types"

type SecretFile = {
  exa?: string
  firecrawl?: string
  parallel?: string
}

const file = path.join(process.cwd(), "data", "secrets.json")

function readFile(): SecretFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as SecretFile
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function getKeys(): { exa?: string; firecrawl?: string; parallel?: string } {
  const stored = readFile()
  const exa = clean(process.env.EXA_API_KEY) || clean(stored.exa)
  const firecrawl = clean(process.env.FIRECRAWL_API_KEY) || clean(stored.firecrawl)
  const parallel = clean(process.env.PARALLEL_API_KEY) || clean(stored.parallel)
  return {
    exa: exa || undefined,
    firecrawl: firecrawl || undefined,
    parallel: parallel || undefined,
  }
}

export function keyFlags(): KeyFlags {
  const stored = readFile()
  return {
    exa: Boolean(clean(process.env.EXA_API_KEY) || clean(stored.exa)),
    firecrawl: Boolean(clean(process.env.FIRECRAWL_API_KEY) || clean(stored.firecrawl)),
    parallel: Boolean(clean(process.env.PARALLEL_API_KEY) || clean(stored.parallel)),
    exaEnv: Boolean(clean(process.env.EXA_API_KEY)),
    firecrawlEnv: Boolean(clean(process.env.FIRECRAWL_API_KEY)),
    parallelEnv: Boolean(clean(process.env.PARALLEL_API_KEY)),
  }
}

export function saveKeys(input: {
  exa?: string
  firecrawl?: string
  parallel?: string
}): { flags: KeyFlags; notes: string[] } {
  const current = readFile()
  const notes: string[] = []
  const next: SecretFile = { ...current }
  const apply = (
    field: keyof SecretFile,
    envName: string,
    value: string | undefined
  ) => {
    if (value === undefined) return
    if (clean(process.env[envName])) {
      notes.push(`${envName} is set in the environment and takes precedence.`)
      return
    }
    const trimmed = value.trim()
    if (trimmed.length > 500) {
      notes.push(`${field} was ignored because it is too long.`)
      return
    }
    if (!trimmed) delete next[field]
    else next[field] = trimmed
  }
  apply("exa", "EXA_API_KEY", input.exa)
  apply("firecrawl", "FIRECRAWL_API_KEY", input.firecrawl)
  apply("parallel", "PARALLEL_API_KEY", input.parallel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 })
  return { flags: keyFlags(), notes }
}

import fs from "node:fs"
import path from "node:path"
import type { KeyFlags } from "./types"

type SecretFile = {
  exa?: string
  firecrawl?: string
  openai?: string
  parallel?: string
  databaseUrl?: string
  atlasAccess?: string
  atlasRefresh?: string
  atlasClientId?: string
  atlasExpiresAt?: string
}

export type AtlasSession = {
  access?: string
  refresh?: string
  clientId?: string
  expiresAt?: string
}

const file = path.join(process.cwd(), "data", "secrets.json")
const visibleFile = path.join(process.cwd(), "api-keys.env")

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

function writeFile(next: SecretFile) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 })
}

function readVisibleFile(): SecretFile {
  try {
    const parsed: SecretFile = {}
    for (const line of fs.readFileSync(visibleFile, "utf8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
      const splitAt = trimmed.indexOf("=")
      const key = trimmed.slice(0, splitAt).trim()
      const value = trimmed.slice(splitAt + 1).trim().replace(/^["']|["']$/g, "")
      if (key === "EXA_API_KEY") parsed.exa = value
      if (key === "FIRECRAWL_API_KEY") parsed.firecrawl = value
      if (key === "OPENAI_API_KEY") parsed.openai = value
      if (key === "PARALLEL_API_KEY") parsed.parallel = value
      if (key === "COMPANY_ATLAS_TOKEN") parsed.atlasAccess = value
    }
    return parsed
  } catch {
    return {}
  }
}

export function getAtlasSession(): AtlasSession {
  const stored = readFile()
  const visible = readVisibleFile()
  return {
    access:
      clean(process.env.COMPANY_ATLAS_TOKEN) ||
      clean(visible.atlasAccess) ||
      clean(stored.atlasAccess) ||
      undefined,
    refresh: clean(stored.atlasRefresh) || undefined,
    clientId: clean(stored.atlasClientId) || undefined,
    expiresAt: clean(stored.atlasExpiresAt) || undefined,
  }
}

export function saveAtlasSession(session: AtlasSession): KeyFlags {
  const next = readFile()
  const put = (field: keyof SecretFile, value: string | undefined) => {
    if (value === undefined) return
    if (value) next[field] = value
    else delete next[field]
  }
  put("atlasAccess", session.access)
  put("atlasRefresh", session.refresh)
  put("atlasClientId", session.clientId)
  put("atlasExpiresAt", session.expiresAt)
  writeFile(next)
  return keyFlags()
}

export function clearAtlasSession(): KeyFlags {
  const next = readFile()
  delete next.atlasAccess
  delete next.atlasRefresh
  delete next.atlasClientId
  delete next.atlasExpiresAt
  writeFile(next)
  return keyFlags()
}

export function envDatabaseUrl(): string {
  return clean(process.env.DATABASE_URL)
}

export function storedDatabaseUrl(): string {
  return clean(readFile().databaseUrl)
}

export function getDatabaseUrl(): string {
  return envDatabaseUrl() || storedDatabaseUrl()
}

export function saveDatabaseUrl(value: string | undefined): { envLocked: boolean } {
  if (envDatabaseUrl()) return { envLocked: true }
  const next = readFile()
  const trimmed = clean(value)
  if (!trimmed) delete next.databaseUrl
  else next.databaseUrl = trimmed
  writeFile(next)
  return { envLocked: false }
}

export function getKeys(): {
  exa?: string
  firecrawl?: string
  openai?: string
  parallel?: string
  atlas?: string
} {
  const stored = readFile()
  const visible = readVisibleFile()
  const exa = clean(process.env.EXA_API_KEY) || clean(visible.exa) || clean(stored.exa)
  const firecrawl =
    clean(process.env.FIRECRAWL_API_KEY) || clean(visible.firecrawl) || clean(stored.firecrawl)
  const openai = clean(process.env.OPENAI_API_KEY) || clean(visible.openai) || clean(stored.openai)
  const parallel =
    clean(process.env.PARALLEL_API_KEY) || clean(visible.parallel) || clean(stored.parallel)
  const atlas = getAtlasSession().access
  return {
    exa: exa || undefined,
    firecrawl: firecrawl || undefined,
    openai: openai || undefined,
    parallel: parallel || undefined,
    atlas: atlas || undefined,
  }
}

export function keyFlags(): KeyFlags {
  const keys = getKeys()
  return {
    exa: Boolean(keys.exa),
    firecrawl: Boolean(keys.firecrawl),
    openai: Boolean(keys.openai),
    parallel: Boolean(keys.parallel),
    atlas: Boolean(keys.atlas),
    exaEnv: Boolean(clean(process.env.EXA_API_KEY)),
    firecrawlEnv: Boolean(clean(process.env.FIRECRAWL_API_KEY)),
    openaiEnv: Boolean(clean(process.env.OPENAI_API_KEY)),
    parallelEnv: Boolean(clean(process.env.PARALLEL_API_KEY)),
    atlasEnv: Boolean(clean(process.env.COMPANY_ATLAS_TOKEN)),
    ragEnv: Boolean(clean(process.env.RAG_API_URL)),
  }
}

export function saveKeys(input: {
  exa?: string
  firecrawl?: string
  openai?: string
  parallel?: string
}): { flags: KeyFlags; notes: string[] } {
  const current = readFile()
  const notes: string[] = []
  const next: SecretFile = { ...current }
  const apply = (
    field: "exa" | "firecrawl" | "openai" | "parallel",
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
  apply("openai", "OPENAI_API_KEY", input.openai)
  apply("parallel", "PARALLEL_API_KEY", input.parallel)
  writeFile(next)
  return { flags: keyFlags(), notes }
}

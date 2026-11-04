import fs from "node:fs"
import path from "node:path"
import { ApiError, requestJson } from "./http"
import { getKeys } from "./keys"
import {
  monitorCreateBody,
  monitorsCreateAllowed,
  topLeadsByCountry,
  verifyExaSignature,
  watchKey,
  webhookPublicUrl,
  type WatchLead,
} from "./monitors"
import { listRuns } from "./store"

export type StoredMonitor = {
  id: string
  key: string
  runId: string
  leadId: string
  name: string
  country: string
  domain: string
  rank: number
  query: string
  webhookSecret: string
  createdAt: string
}

type StoreFile = { monitors: StoredMonitor[] }

const file = path.join(process.cwd(), "data", "monitors.json")

function readStore(): StoreFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as StoreFile
    if (!parsed || !Array.isArray(parsed.monitors)) return { monitors: [] }
    return parsed
  } catch {
    return { monitors: [] }
  }
}

function writeStore(next: StoreFile) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 })
}

export function listStoredMonitors(): StoredMonitor[] {
  return readStore().monitors
}

export function publicMonitors(): Omit<StoredMonitor, "webhookSecret">[] {
  return listStoredMonitors().map(({ webhookSecret: _secret, ...row }) => row)
}

export function findMonitorBySignature(payload: string, signature: string): StoredMonitor | undefined {
  return listStoredMonitors().find((row) => verifyExaSignature(payload, signature, row.webhookSecret))
}

export function watchedLeadIds(): Set<string> {
  return new Set(listStoredMonitors().map((row) => row.leadId))
}

async function exaCreate(watch: WatchLead, webhookUrl: string, key: string): Promise<StoredMonitor> {
  const body = monitorCreateBody(watch, webhookUrl)
  const data = (await requestJson("https://api.exa.ai/monitors", {
    method: "POST",
    timeoutMs: 30000,
    headers: { Authorization: `Bearer ${key}`, "x-api-key": key },
    body: JSON.stringify(body),
  })) as { id?: string; webhookSecret?: string; webhook_secret?: string }
  const id = typeof data.id === "string" ? data.id : ""
  const secret = typeof data.webhookSecret === "string" ? data.webhookSecret : data.webhook_secret
  if (!id || !secret) {
    throw new ApiError("Exa created a monitor without an id or webhookSecret.", 502)
  }
  return {
    id,
    key: watchKey(watch.country, watch.domain, watch.name),
    runId: watch.runId,
    leadId: watch.leadId,
    name: watch.name,
    country: watch.country,
    domain: watch.domain,
    rank: watch.rank,
    query: body.search.query,
    webhookSecret: secret,
    createdAt: new Date().toISOString(),
  }
}

async function exaDelete(id: string, key: string) {
  try {
    await requestJson(`https://api.exa.ai/monitors/${id}`, {
      method: "DELETE",
      timeoutMs: 20000,
      headers: { Authorization: `Bearer ${key}`, "x-api-key": key },
    })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return
    throw error
  }
}

export type MonitorSyncResult = {
  webhookUrl: string
  watched: number
  created: number
  removed: number
  kept: number
  errors: string[]
  watch: WatchLead[]
}

export async function syncMonitors(): Promise<MonitorSyncResult> {
  const keys = getKeys()
  const webhookUrl = webhookPublicUrl()
  const runs = await listRuns()
  const watch = topLeadsByCountry(runs)
  const result: MonitorSyncResult = {
    webhookUrl,
    watched: watch.length,
    created: 0,
    removed: 0,
    kept: 0,
    errors: [],
    watch,
  }
  if (!keys.exa) {
    result.errors.push("EXA_API_KEY missing. Monitors were not created.")
    return result
  }
  if (/localhost|127\.0\.0\.1/i.test(webhookUrl)) {
    result.errors.push("The webhook must be HTTPS on Render, not localhost.")
    return result
  }
  if (!monitorsCreateAllowed()) {
    result.errors.push(
      "Crie os monitors no live https://exportsales.onrender.com/leads. O webhookSecret tem de ficar no disco do Render para o POST /api/exa/webhook verificar a assinatura."
    )
    return result
  }
  const wanted = new Map(watch.map((row) => [watchKey(row.country, row.domain, row.name), row]))
  const current = readStore()
  const next: StoredMonitor[] = []
  for (const row of current.monitors) {
    if (wanted.has(row.key)) {
      next.push(row)
      result.kept += 1
      wanted.delete(row.key)
    } else {
      try {
        await exaDelete(row.id, keys.exa)
        result.removed += 1
      } catch (error) {
        result.errors.push(`${row.name}: ${error instanceof Error ? error.message : "delete failed"}`)
        next.push(row)
      }
    }
  }
  for (const watchRow of wanted.values()) {
    try {
      next.push(await exaCreate(watchRow, webhookUrl, keys.exa))
      result.created += 1
    } catch (error) {
      result.errors.push(`${watchRow.name}: ${error instanceof Error ? error.message : "create failed"}`)
    }
  }
  writeStore({ monitors: next })
  return result
}

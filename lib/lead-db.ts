import { Pool, type PoolClient } from "pg"
import { SAMPLE_RUN_ID } from "./ids"
import type { DbStatus, Lead, LeadRecord, LeadSeed, Run } from "./types"

const SCHEMA = `
CREATE TABLE IF NOT EXISTS desk_runs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  supplier TEXT NOT NULL,
  markets TEXT NOT NULL,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS desk_leads (
  id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES desk_runs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  country TEXT NOT NULL,
  market TEXT,
  seed TEXT,
  band TEXT,
  score INTEGER,
  fit TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  last_purchase TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (run_id, id)
);
CREATE INDEX IF NOT EXISTS desk_leads_domain_idx ON desk_leads (lower(domain));
CREATE INDEX IF NOT EXISTS desk_leads_country_idx ON desk_leads (country);
CREATE INDEX IF NOT EXISTS desk_leads_name_idx ON desk_leads (lower(name));
`

let pool: Pool | undefined
let schemaReady: Promise<void> | undefined
let migrated = false
let lastError: string | undefined

export function databaseUrl(): string {
  return (process.env.DATABASE_URL || "").trim()
}

export function postgresConfigured(): boolean {
  return Boolean(databaseUrl()) && process.env.NEXT_PHASE !== "phase-production-build"
}

export function postgresLastError(): string | undefined {
  return lastError
}

export function postgresWantsSsl(url: string): boolean {
  if (process.env.DATABASE_SSL === "false") return false
  if (process.env.DATABASE_SSL === "true" || process.env.PGSSLMODE === "require") return true
  if (/sslmode=require/i.test(url)) return true
  if (/sslmode=(disable|allow|prefer)/i.test(url)) return false
  return /\.render\.com|\.supabase\.co|\.supabase\.com/i.test(url)
}

function getPool(): Pool {
  const url = databaseUrl()
  if (!url) throw new Error("DATABASE_URL is not set.")
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
      ssl: postgresWantsSsl(url) ? { rejectUnauthorized: false } : undefined,
    })
  }
  return pool
}

export function toLeadRecord(run: Run, lead: Lead): LeadRecord {
  return {
    id: lead.id,
    runId: run.id,
    name: lead.name,
    domain: lead.domain || "",
    url: lead.url || "",
    country: lead.country || lead.market || "",
    market: lead.market,
    seed: lead.seed,
    supplier: run.brief.supplierName,
    status: run.status,
    band: lead.score?.band,
    score: lead.score?.total,
    fit: lead.fit?.level,
    email: lead.extraction?.email || undefined,
    phone: lead.extraction?.phone || lead.extraction?.whatsapp || undefined,
    website: lead.extraction?.website || lead.url || undefined,
    lastPurchase: lead.extraction?.lastPurchase || undefined,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

export function listLeadRecordsFromRuns(runs: Run[]): LeadRecord[] {
  const rows: LeadRecord[] = []
  for (const run of runs) {
    if (run.mode === "sample") continue
    for (const lead of run.leads ?? []) {
      rows.push(toLeadRecord(run, lead))
    }
  }
  rows.sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name)
  )
  return rows
}

export async function ensureLeadSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((error) => {
        schemaReady = undefined
        throw error
      })
  }
  await schemaReady
}

function liveRuns(runs: Run[]): Run[] {
  return runs.filter((run) => run.mode !== "sample" && run.id !== SAMPLE_RUN_ID)
}

export async function migrateJsonIfEmpty(runs: Run[]): Promise<number> {
  await ensureLeadSchema()
  const counted = await getPool().query<{ n: number }>("SELECT count(*)::int AS n FROM desk_runs")
  if ((counted.rows[0]?.n ?? 0) > 0) return 0
  const incoming = liveRuns(runs)
  for (const run of incoming) {
    await pgSaveRun(run)
  }
  return incoming.length
}

export async function readyPostgres(jsonRuns: () => Run[]): Promise<boolean> {
  if (!postgresConfigured()) return false
  try {
    await ensureLeadSchema()
    if (!migrated) {
      await migrateJsonIfEmpty(jsonRuns())
      migrated = true
    }
    lastError = undefined
    return true
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Postgres connection failed."
    return false
  }
}

async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch {
      // Connection already gone.
    }
    throw error
  } finally {
    client.release()
  }
}

export async function pgListRuns(): Promise<Run[]> {
  await ensureLeadSchema()
  const { rows } = await getPool().query<{ payload: Run }>(
    "SELECT payload FROM desk_runs WHERE id <> $1 ORDER BY created_at DESC",
    [SAMPLE_RUN_ID]
  )
  return rows.map((row) => row.payload)
}

export async function pgGetRun(id: string): Promise<Run | null> {
  await ensureLeadSchema()
  const { rows } = await getPool().query<{ payload: Run }>(
    "SELECT payload FROM desk_runs WHERE id = $1",
    [id]
  )
  return rows[0]?.payload ?? null
}

export async function pgSaveRun(run: Run): Promise<void> {
  if (run.id === SAMPLE_RUN_ID || run.mode === "sample") return
  await ensureLeadSchema()
  await withTx(async (client) => {
    await client.query(
      `INSERT INTO desk_runs (id, created_at, updated_at, mode, status, supplier, markets, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         updated_at = EXCLUDED.updated_at,
         mode = EXCLUDED.mode,
         status = EXCLUDED.status,
         supplier = EXCLUDED.supplier,
         markets = EXCLUDED.markets,
         payload = EXCLUDED.payload`,
      [
        run.id,
        run.createdAt,
        run.updatedAt,
        run.mode,
        run.status,
        run.brief.supplierName,
        run.brief.markets,
        JSON.stringify(run),
      ]
    )
    const leads = run.leads ?? []
    const ids = leads.map((lead) => lead.id)
    if (ids.length === 0) {
      await client.query("DELETE FROM desk_leads WHERE run_id = $1", [run.id])
    } else {
      await client.query("DELETE FROM desk_leads WHERE run_id = $1 AND NOT (id = ANY($2::text[]))", [
        run.id,
        ids,
      ])
    }
    for (const lead of leads) {
      const row = toLeadRecord(run, lead)
      await client.query(
        `INSERT INTO desk_leads (
           id, run_id, name, domain, url, country, market, seed, band, score, fit,
           email, phone, website, last_purchase, payload, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17
         )
         ON CONFLICT (run_id, id) DO UPDATE SET
           name = EXCLUDED.name,
           domain = EXCLUDED.domain,
           url = EXCLUDED.url,
           country = EXCLUDED.country,
           market = EXCLUDED.market,
           seed = EXCLUDED.seed,
           band = EXCLUDED.band,
           score = EXCLUDED.score,
           fit = EXCLUDED.fit,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           website = EXCLUDED.website,
           last_purchase = EXCLUDED.last_purchase,
           payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at`,
        [
          row.id,
          row.runId,
          row.name,
          row.domain,
          row.url,
          row.country,
          row.market ?? null,
          row.seed ?? null,
          row.band ?? null,
          row.score ?? null,
          row.fit ?? null,
          row.email ?? null,
          row.phone ?? null,
          row.website ?? null,
          row.lastPurchase ?? null,
          JSON.stringify(lead),
          row.updatedAt,
        ]
      )
    }
  })
}

export async function pgDeleteRun(id: string): Promise<void> {
  await ensureLeadSchema()
  await getPool().query("DELETE FROM desk_runs WHERE id = $1", [id])
}

type LeadSqlRow = {
  id: string
  run_id: string
  name: string
  domain: string
  url: string
  country: string
  market: string | null
  seed: LeadSeed | null
  band: LeadRecord["band"] | null
  score: number | null
  fit: LeadRecord["fit"] | null
  email: string | null
  phone: string | null
  website: string | null
  last_purchase: string | null
  updated_at: Date | string
  supplier: string
  status: LeadRecord["status"]
  created_at: Date | string
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

export async function pgListLeadRecords(): Promise<LeadRecord[]> {
  await ensureLeadSchema()
  const { rows } = await getPool().query<LeadSqlRow>(
    `SELECT l.id, l.run_id, l.name, l.domain, l.url, l.country, l.market, l.seed,
            l.band, l.score, l.fit, l.email, l.phone, l.website, l.last_purchase,
            l.updated_at, r.supplier, r.status, r.created_at
     FROM desk_leads l
     JOIN desk_runs r ON r.id = l.run_id
     ORDER BY l.updated_at DESC, l.name ASC`
  )
  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    name: row.name,
    domain: row.domain,
    url: row.url,
    country: row.country,
    market: row.market || undefined,
    seed: row.seed || undefined,
    supplier: row.supplier,
    status: row.status,
    band: row.band || undefined,
    score: row.score ?? undefined,
    fit: row.fit || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    website: row.website || undefined,
    lastPurchase: row.last_purchase || undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }))
}

export async function postgresStatus(): Promise<DbStatus> {
  if (!postgresConfigured()) {
    return { postgres: false, leadCount: 0, runCount: 0 }
  }
  try {
    await ensureLeadSchema()
    const runs = await getPool().query<{ n: number }>("SELECT count(*)::int AS n FROM desk_runs")
    const leads = await getPool().query<{ n: number }>("SELECT count(*)::int AS n FROM desk_leads")
    lastError = undefined
    return {
      postgres: true,
      runCount: runs.rows[0]?.n ?? 0,
      leadCount: leads.rows[0]?.n ?? 0,
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Postgres connection failed."
    return { postgres: true, leadCount: 0, runCount: 0, error: lastError }
  }
}

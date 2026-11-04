import { Pool, type PoolClient } from "pg"
import { databaseHintFromUrl, explainPostgresError } from "./database-url"
import { envDatabaseUrl, getDatabaseUrl } from "./keys"
import { SAMPLE_RUN_ID } from "./ids"
import type { DbStatus, Lead, LeadRecord, LeadSeed, Run } from "./types"

/** Live Export Desk tables. Older CRM tables in the same project are never read. */
export const DESK_RUNS_TABLE = "desk_runs"
export const DESK_LEADS_TABLE = "desk_leads"

export const IGNORED_SUPABASE_TABLES = [
  "Leads",
  "leads_master",
  "leads_enriquecidas",
  "leads_comesa_gem",
  "leads-lote13",
  "tradeindata_novas_leads_import",
  "tradeindata_stage_20260810",
  "trade_test_runs",
  "trade_test_shipments",
  "trade_test_companies",
  "clientes",
  "demandas_clientes",
  "distribuidores_cadastrados",
  "evidencias_empresas",
  "fornecedores_feira",
  "fornecedores_nacionais",
  "fornecedores_nacionais_icp",
  "importadores_premium",
  "matches_feira",
  "matches_inteligentes",
  "mensagens_abordagem",
  "oportunidades_comerciais",
  "relacoes_embarque",
  "swift_search_jobs",
] as const

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
  fit_index INTEGER,
  icp TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  last_purchase TEXT,
  response_level TEXT,
  response_score INTEGER,
  response_note TEXT,
  signals_at TIMESTAMPTZ,
  hiring BOOLEAN,
  mix_change BOOLEAN,
  social_growth BOOLEAN,
  rag_match BOOLEAN,
  rag_neighbor TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (run_id, id)
);
CREATE INDEX IF NOT EXISTS desk_leads_domain_idx ON desk_leads (lower(domain));
CREATE INDEX IF NOT EXISTS desk_leads_country_idx ON desk_leads (country);
CREATE INDEX IF NOT EXISTS desk_leads_name_idx ON desk_leads (lower(name));
CREATE INDEX IF NOT EXISTS desk_leads_response_idx ON desk_leads (response_level, response_score DESC);
CREATE INDEX IF NOT EXISTS desk_leads_signals_idx ON desk_leads (signals_at);
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS response_level TEXT;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS response_score INTEGER;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS response_note TEXT;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS signals_at TIMESTAMPTZ;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS hiring BOOLEAN;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS mix_change BOOLEAN;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS social_growth BOOLEAN;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS fit_index INTEGER;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS icp TEXT;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS rag_match BOOLEAN;
ALTER TABLE desk_leads ADD COLUMN IF NOT EXISTS rag_neighbor TEXT;
ALTER TABLE desk_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE desk_leads ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE desk_runs FROM anon;
    REVOKE ALL ON TABLE desk_leads FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE desk_runs FROM authenticated;
    REVOKE ALL ON TABLE desk_leads FROM authenticated;
  END IF;
END $$;
`

let pool: Pool | undefined
let schemaReady: Promise<void> | undefined
let migrated = false
let lastError: string | undefined

let poolUrl = ""

export function databaseUrl(): string {
  return getDatabaseUrl()
}

export function resetPostgresPool() {
  const old = pool
  pool = undefined
  poolUrl = ""
  schemaReady = undefined
  migrated = false
  lastError = undefined
  void old?.end().catch(() => undefined)
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
  if (!pool || poolUrl !== url) {
    const old = pool
    pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 12_000,
      ssl: postgresWantsSsl(url) ? { rejectUnauthorized: false } : undefined,
    })
    poolUrl = url
    schemaReady = undefined
    migrated = false
    void old?.end().catch(() => undefined)
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
    fitIndex: lead.fit?.index,
    icp: lead.context?.icp || lead.openai?.icp,
    email: lead.extraction?.email || undefined,
    phone: lead.extraction?.phone || lead.extraction?.whatsapp || undefined,
    website: lead.extraction?.website || lead.url || undefined,
    lastPurchase: lead.extraction?.lastPurchase || undefined,
    responseLevel: lead.response?.level,
    responseScore: lead.response?.score,
    responseNote: lead.response?.note,
    signalsAt: lead.signalsAt || lead.response?.computedAt,
    hiring: lead.response?.hiring,
    mixChange: lead.response?.mixChange,
    socialGrowth: lead.response?.socialGrowth,
    ragMatch: lead.rag?.checked ? lead.rag.match : undefined,
    ragNeighbor: lead.rag?.neighbor || undefined,
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
  const counted = await getPool().query<{ n: number }>(`SELECT count(*)::int AS n FROM ${DESK_RUNS_TABLE}`)
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
    lastError = explainPostgresError(error instanceof Error ? error.message : "Postgres connection failed.")
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
    `SELECT payload FROM ${DESK_RUNS_TABLE} WHERE id <> $1 ORDER BY created_at DESC`,
    [SAMPLE_RUN_ID]
  )
  return rows.map((row) => row.payload)
}

export async function pgGetRun(id: string): Promise<Run | null> {
  await ensureLeadSchema()
  const { rows } = await getPool().query<{ payload: Run }>(
    `SELECT payload FROM ${DESK_RUNS_TABLE} WHERE id = $1`,
    [id]
  )
  return rows[0]?.payload ?? null
}

export async function pgSaveRun(run: Run): Promise<void> {
  if (run.id === SAMPLE_RUN_ID || run.mode === "sample") return
  await ensureLeadSchema()
  await withTx(async (client) => {
    await client.query(
      `INSERT INTO ${DESK_RUNS_TABLE} (id, created_at, updated_at, mode, status, supplier, markets, payload)
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
      await client.query(`DELETE FROM ${DESK_LEADS_TABLE} WHERE run_id = $1`, [run.id])
    } else {
      await client.query(`DELETE FROM ${DESK_LEADS_TABLE} WHERE run_id = $1 AND NOT (id = ANY($2::text[]))`, [
        run.id,
        ids,
      ])
    }
    for (const lead of leads) {
      const row = toLeadRecord(run, lead)
      await client.query(
        `INSERT INTO ${DESK_LEADS_TABLE} (
           id, run_id, name, domain, url, country, market, seed, band, score, fit, fit_index, icp,
           email, phone, website, last_purchase, response_level, response_score, response_note,
           signals_at, hiring, mix_change, social_growth, rag_match, rag_neighbor, payload, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
           $21, $22, $23, $24, $25, $26, $27::jsonb, $28
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
           fit_index = EXCLUDED.fit_index,
           icp = EXCLUDED.icp,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           website = EXCLUDED.website,
           last_purchase = EXCLUDED.last_purchase,
           response_level = EXCLUDED.response_level,
           response_score = EXCLUDED.response_score,
           response_note = EXCLUDED.response_note,
           signals_at = EXCLUDED.signals_at,
           hiring = EXCLUDED.hiring,
           mix_change = EXCLUDED.mix_change,
           social_growth = EXCLUDED.social_growth,
           rag_match = EXCLUDED.rag_match,
           rag_neighbor = EXCLUDED.rag_neighbor,
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
          row.fitIndex ?? null,
          row.icp ?? null,
          row.email ?? null,
          row.phone ?? null,
          row.website ?? null,
          row.lastPurchase ?? null,
          row.responseLevel ?? null,
          row.responseScore ?? null,
          row.responseNote ?? null,
          row.signalsAt ?? null,
          row.hiring ?? null,
          row.mixChange ?? null,
          row.socialGrowth ?? null,
          row.ragMatch ?? null,
          row.ragNeighbor ?? null,
          JSON.stringify(lead),
          row.updatedAt,
        ]
      )
    }
  })
}

export async function pgDeleteRun(id: string): Promise<void> {
  await ensureLeadSchema()
  await getPool().query(`DELETE FROM ${DESK_RUNS_TABLE} WHERE id = $1`, [id])
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
  fit_index: number | null
  icp: LeadRecord["icp"] | null
  email: string | null
  phone: string | null
  website: string | null
  last_purchase: string | null
  response_level: LeadRecord["responseLevel"] | null
  response_score: number | null
  response_note: string | null
  signals_at: Date | string | null
  hiring: boolean | null
  mix_change: boolean | null
  social_growth: boolean | null
  rag_match: boolean | null
  rag_neighbor: string | null
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
            l.band, l.score, l.fit, l.fit_index, l.icp, l.email, l.phone, l.website, l.last_purchase,
            l.response_level, l.response_score, l.response_note, l.signals_at,
            l.hiring, l.mix_change, l.social_growth, l.rag_match, l.rag_neighbor,
            l.updated_at, r.supplier, r.status, r.created_at
     FROM ${DESK_LEADS_TABLE} l
     JOIN ${DESK_RUNS_TABLE} r ON r.id = l.run_id
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
    fitIndex: row.fit_index ?? undefined,
    icp: row.icp || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    website: row.website || undefined,
    lastPurchase: row.last_purchase || undefined,
    responseLevel: row.response_level || undefined,
    responseScore: row.response_score ?? undefined,
    responseNote: row.response_note || undefined,
    signalsAt: row.signals_at ? iso(row.signals_at) : undefined,
    hiring: row.hiring ?? undefined,
    mixChange: row.mix_change ?? undefined,
    socialGrowth: row.social_growth ?? undefined,
    ragMatch: row.rag_match ?? undefined,
    ragNeighbor: row.rag_neighbor || undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }))
}

function statusHint(url: string): Pick<DbStatus, "source" | "host" | "port" | "user" | "envLocked"> {
  const source = envDatabaseUrl() ? "env" : url ? "file" : "none"
  return {
    ...databaseHintFromUrl(url, source),
    envLocked: Boolean(envDatabaseUrl()),
  }
}

export async function postgresStatus(): Promise<DbStatus> {
  const url = databaseUrl()
  const hint = statusHint(url)
  const tables = [DESK_RUNS_TABLE, DESK_LEADS_TABLE]
  if (!postgresConfigured()) {
    return { postgres: false, leadCount: 0, runCount: 0, source: "none", tables, ...hint }
  }
  try {
    await ensureLeadSchema()
    const runs = await getPool().query<{ n: number }>(`SELECT count(*)::int AS n FROM ${DESK_RUNS_TABLE}`)
    const leads = await getPool().query<{ n: number }>(`SELECT count(*)::int AS n FROM ${DESK_LEADS_TABLE}`)
    lastError = undefined
    return {
      postgres: true,
      runCount: runs.rows[0]?.n ?? 0,
      leadCount: leads.rows[0]?.n ?? 0,
      tables,
      ...hint,
    }
  } catch (error) {
    lastError = explainPostgresError(error instanceof Error ? error.message : "Postgres connection failed.")
    return { postgres: true, leadCount: 0, runCount: 0, error: lastError, tables, ...hint }
  }
}

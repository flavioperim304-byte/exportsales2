export type StageId = "search" | "extract" | "context" | "classify"

export type RunStatus =
  | "queued"
  | "searching"
  | "extracting"
  | "researching"
  | "scoring"
  | "complete"
  | "failed"

export type StageStatus = "pending" | "running" | "done" | "blocked" | "failed"

export type Band = "best_fit" | "strong" | "possible" | "weak" | "disqualified"

export type ContextState =
  | "pending"
  | "running"
  | "done"
  | "skipped"
  | "deferred"
  | "failed"

export type Brief = {
  supplierName: string
  originCountry: string
  website: string
  products: string
  differentiators: string
  certifications: string
  markets: string
  buyerTypes: string
  mustHaves: string
  exclusions: string
  /** Extra sentences inserted into the Exa, Firecrawl, and Parallel prompts. */
  instructions?: string
  /** Leads requested in each target country. Live runs use 10. */
  leadCount: number
  /** buyers finds customers for the supplier. competitors maps who already distributes a brand. */
  searchKind?: "buyers" | "competitors"
  /** Exa Deep is the faster search. Exa Ultra is the long list-building agent. */
  exaEffort?: "deep" | "ultra"
  /** Task is the default Parallel research. Decisions is opt-in for that run. */
  parallelMode?: "task" | "decisions"
  /** How many countries a competitor search should cover. */
  countryCount?: number
  /** Countries a competitor search must leave out. */
  excludedMarkets?: string
}

export type Evidence = {
  source: "exa" | "firecrawl" | "parallel" | "rule"
  label: string
  quote: string
  url?: string
}

export type DimensionScore = {
  key: string
  label: string
  points: number
  max: number
  rationale: string
  evidence: Evidence[]
}

export type LeadScore = {
  total: number
  band: Band
  headline: string
  nextAction: string
  disqualified: boolean
  disqualifyReason?: string
  dimensions: DimensionScore[]
}

export type ExaHit = {
  title: string
  url: string
  domain: string
  publishedDate?: string
  text: string
  highlights: string[]
  summary: string
}

export type Extraction = {
  ok: boolean
  error?: string
  companyName: string
  headquarters: string
  country: string
  role: string
  buys: string[]
  sells: string[]
  markets: string[]
  certifications: string[]
  buyerSignals: string[]
  summary: string
  excerpt: string
  /** Published contacts. Empty when the page does not state them. */
  email?: string
  phone?: string
  whatsapp?: string
  website?: string
}

export type FitJudgment = {
  icp: "high" | "medium" | "low"
  supplierFits: { supplier: string; level: "high" | "medium" | "low" }[]
  bestFit: string
  qualificationNeeded: string
  rationale: string
}

export type LeadContext = {
  fitNarrative: string
  knownSuppliers: string[]
  risks: string[]
  citations: string[]
  icp?: "high" | "medium" | "low"
  supplierFits?: { supplier: string; level: "high" | "medium" | "low" }[]
  bestFit?: string
  qualificationNeeded?: string
}

export type Lead = {
  id: string
  name: string
  domain: string
  url: string
  country: string
  /** Country this lead was searched for. Not treated as evidence of where the company is based. */
  market?: string
  /** Buyer type this lead was searched under, when the brief lists more than one. */
  buyerType?: string
  exa: ExaHit
  extraction?: Extraction
  context?: LeadContext
  score?: LeadScore
  /** Score against the second supplier, when one run qualifies two brands. */
  alsoScore?: LeadScore
  /** Preliminary score from OpenAI. Parallel may replace it. */
  openai?: FitJudgment
}

export type MarketContext = {
  outlook: string
  buyerDynamics: string
  importSignals: string[]
  citations: string[]
  purchaseProbability?: "high" | "medium" | "low" | ""
  purchaseNote?: string
  entryStrategy?: string
}

export type MarketEntry = {
  purchaseProbability: "high" | "medium" | "low" | ""
  purchaseNote: string
  strategy: string
}

export type Competitor = {
  name: string
  country: string
  whyRelevant: string
  url: string
}

export type StageState = {
  id: StageId
  status: StageStatus
  detail: string
  startedAt?: string
  finishedAt?: string
}

export type LogLine = {
  at: string
  stage: StageId | "system"
  message: string
}

export type Run = {
  id: string
  createdAt: string
  updatedAt: string
  mode: "live" | "sample"
  status: RunStatus
  brief: Brief
  /** Second supplier scored on the same companies. */
  also?: Brief
  stages: StageState[]
  logs: LogLine[]
  leads: Lead[]
  market?: MarketContext
  competitors: Competitor[]
  /** OpenAI's market call. Parallel replaces it on run.market when it returns. */
  entry?: MarketEntry
  parallelRunId?: string
  parallelInteractionId?: string
  /** Set when this run used Parallel Decisions instead of a Task run. */
  parallelDecisionId?: string
  parallelCheckedAt?: string
  parallelErrors?: number
  searchClaimed?: boolean
  contextState: ContextState
  error?: string
}

export type KeyFlags = {
  exa: boolean
  firecrawl: boolean
  openai: boolean
  parallel: boolean
  exaEnv: boolean
  firecrawlEnv: boolean
  openaiEnv: boolean
  parallelEnv: boolean
}

export type RunSummary = {
  id: string
  mode: "live" | "sample"
  status: RunStatus
  supplierName: string
  originCountry: string
  markets: string
  products: string
  createdAt: string
  leadCount: number
  topLead?: {
    name: string
    band: Band
    total: number
  }
}

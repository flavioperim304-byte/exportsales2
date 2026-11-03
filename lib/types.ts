export type StageId = "search" | "extract" | "context" | "classify" | "diligence"

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
  /** Harmonized System code for Brazil export volume via Comex Stat. 2, 4, 6, or 8 digits. */
  hsCode?: string
}

export type Evidence = {
  source: "exa" | "firecrawl" | "parallel" | "rule"
  label: string
  quote: string
  url?: string
}

export type ActivityKind = "news" | "launch" | "brand" | "social"

export type ActivitySignal = {
  kind: ActivityKind
  title: string
  url: string
  publishedAt?: string
  quote: string
}

export type ActivitySnapshot = {
  fetchedAt: string
  signals: ActivitySignal[]
  error?: string
}

export type CommerceKind = "customs" | "restock" | "trade_fair" | "open_book" | "hiring_buy"

export type CommerceSignalSource = "exa" | "trade_record"

export type CommerceSignal = {
  kind: CommerceKind
  title: string
  url: string
  publishedAt?: string
  quote: string
  /** Exa is a web mention. Only trade_record is a filing. */
  source?: CommerceSignalSource
}

export type TradeSource = "tradeindata" | "csv" | "paste"

export type TradePartnerKind =
  | "factory"
  | "logistics"
  | "retail_parcel"
  | "unpublished"
  | "zona_libre"
  | "affiliate"
  | "unknown"

export type TradeCargoKind = "shampoo" | "sample" | "hotel_amenity" | "medicated" | "noise"

export type TradeFilingQuality = "usable" | "occupied" | "logistics_only" | "parcel" | "sample"

export type TradePartner = {
  name: string
  sharePct?: number
  kind: TradePartnerKind
  canonical?: string
}

export type TradeFiling = {
  id: string
  importer: string
  country: string
  lastTradeDate?: string
  description: string
  hs: string
  hsShipments: number
  totalShipments: number
  partners: TradePartner[]
  latestMonths: string[]
  cargo: TradeCargoKind
  occupiedBrands: string[]
  occupiedShare: number
  logisticsShare: number
  brazilHint: boolean
  quality: TradeFilingQuality
  source: TradeSource
}

export type TradeFilingMatch = {
  recordId: string
  importer: string
  hs: string
  hsShipments: number
  lastTradeDate?: string
  cargo: TradeCargoKind
  quality: TradeFilingQuality
  occupiedBrands: string[]
  occupiedShare: number
  partners: TradePartner[]
  description: string
  latestMonths: string[]
  brazilHint: boolean
  logisticsShare: number
  note: string
}

export type CommerceSnapshot = {
  fetchedAt: string
  signals: CommerceSignal[]
  error?: string
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
  /** Last inbound purchase or shipment, only when the page states it. */
  lastPurchase?: string
  /** Stock or restock language, only when the page states it. */
  stock?: string
  /** How current brands are performing, only when the page states it. */
  brandPerformance?: string
  /** Published sales or volume, only when the page states a figure or trend. */
  salesNote?: string
  /** Competitor moves named on the page. */
  competitorMoves?: string[]
}

export type BuyingKind = "last_purchase" | "stock" | "brand_performance" | "sales" | "competitor_move"

export type BuyingFact = {
  kind: BuyingKind
  found: boolean
  recency: "recent" | "stale" | "unknown"
  quote: string
  url?: string
}

export type FitProbability = {
  level: "high" | "medium" | "low"
  /** Evidence index 0–100. Not a predicted order rate. */
  index: number
  note: string
  missing: BuyingKind[]
  facts: BuyingFact[]
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

export type DiligenceBrandKind = "kanechom" | "lq" | "generic"

export type DiligenceBlock =
  | "channel"
  | "portfolio"
  | "import"
  | "geography"
  | "activity"
  | "opening"

export type DiligenceEvidenceState =
  | "strong"
  | "partial"
  | "stale"
  | "absent"
  | "inadequate"
  | "contradictory"
  | "negative"

export type DiligenceFindingKind = "fact" | "indication" | "interpretation" | "needs_confirmation"

export type DiligencePolarity = "supports" | "against" | "absent" | "neutral"

export type DiligenceConfidence = "high" | "medium" | "low"

/** Commercial approach priority. pursue is not a confirmed purchase. */
export type DiligencePriority = "pursue" | "investigate" | "watch" | "skip"

export type DiligenceImportCapacity =
  | "confirmed"
  | "indicated"
  | "not_found"
  | "negative"
  | "unknown"

export type DiligenceGapKind = "missing" | "stale" | "inadequate"

export type DiligenceQuestionId =
  | "import_path"
  | "exclusivity"
  | "portfolio"
  | "launch_capacity"
  | "channel_fit"
  | "hiring_signal"

export type DiligenceFinding = {
  kind: DiligenceFindingKind
  polarity: DiligencePolarity
  topic: DiligenceBlock | DiligenceQuestionId | string
  text: string
  urls: string[]
  evidenceAt?: string
}

export type DiligenceProbe = {
  questionId: DiligenceQuestionId
  question: string
  gap: DiligenceGapKind
  query: string
  ranAt: string
  result: "found" | "not_found" | "failed"
  evidenceAt?: string
  urls: string[]
  note: string
}

export type DiligenceBlockScore = {
  key: DiligenceBlock
  label: string
  state: DiligenceEvidenceState
  points: number
  max: number
  rationale: string
}

export type DiligenceSection = {
  title: string
  text: string
  stale: boolean
  evidenceAt?: string
}

export type DiligenceDiffChange = {
  field: string
  before: string
  after: string
}

export type DiligenceDiff = {
  previousInvestigatedAt: string
  opportunity: { before: number; after: number }
  confidence: { before: DiligenceConfidence; after: DiligenceConfidence }
  importCapacity: { before: DiligenceImportCapacity; after: DiligenceImportCapacity }
  changes: DiligenceDiffChange[]
}

export type DiligenceReport = {
  brand: string
  brandKind: DiligenceBrandKind
  status: "running" | "done" | "failed"
  investigatedAt: string
  evidenceFrom?: string
  evidenceTo?: string
  staleSections: DiligenceBlock[]
  opportunityScore: number
  confidence: DiligenceConfidence
  confidenceNote: string
  /** Approach priority for a salesperson. Not purchase intent. */
  priority: DiligencePriority
  priorityNote: string
  importCapacity: DiligenceImportCapacity
  importNote: string
  blocks: DiligenceBlockScore[]
  structure: DiligenceSection
  portfolio: DiligenceSection
  import: DiligenceSection
  recentActivity: DiligenceSection
  opportunity: DiligenceSection
  approach: DiligenceSection
  findings: DiligenceFinding[]
  probes: DiligenceProbe[]
  citations: { url: string; title: string; publishedAt?: string }[]
  complementary: { ran: boolean; reason: string }
  diff?: DiligenceDiff
  error?: string
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
  /** News, launches, new brands, and social posts found after the company search. */
  activity?: ActivitySnapshot
  /** Customs, restock, fair, open-book, and purchasing-hire hits. Exa customs is a mention, not a BL. */
  commerce?: CommerceSnapshot
  /** Normalized TradeInData / customs CSV matched to this company. */
  filing?: TradeFilingMatch
  /** True after the desk tried to match stored filings, even when none hit. */
  filingChecked?: boolean
  /** Desk-calculated fit probability from published buying facts. */
  fit?: FitProbability
  /** Chroma RAG check against previously ingested dashboard CSVs. */
  rag?: RagMatch
  /** Commercial due diligence reports, newest last. One brand per report. */
  diligence?: DiligenceReport[]
}

export type RagMatch = {
  checked: boolean
  match: boolean
  exact?: boolean
  distance?: number
  neighbor?: string
  note: string
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

export type TradeYear = {
  year: number
  usdFob: number
  kg: number
  months: number
}

export type CountryTrade = {
  country: string
  years: TradeYear[]
  error?: string
}

export type TradeSnapshot = {
  hsCode: string
  hsFilter: "chapter" | "heading" | "subHeading" | "ncm"
  hsLabel: string
  periodFrom: string
  periodTo: string
  source: string
  countries: CountryTrade[]
  error?: string
  fetchedAt: string
  /** ISO time after which a failed Comex Stat call may be tried again. */
  retryAfter?: string
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
  /** Brazil export volume to each search country, last 3 years, from Comex Stat. */
  trade?: TradeSnapshot
  /** OpenAI's market call. Parallel replaces it on run.market when it returns. */
  entry?: MarketEntry
  parallelRunId?: string
  parallelInteractionId?: string
  /** Set when this run used Parallel Decisions instead of a Task run. */
  parallelDecisionId?: string
  parallelCheckedAt?: string
  parallelErrors?: number
  searchClaimed?: boolean
  /** Resumable Exa work for hosts that stop between requests, such as Netlify. */
  searchTasks?: { country: string; buyerType: string; backup: boolean }[]
  searchTaskIndex?: number
  searchJobId?: string
  searchOutside?: number
  /** Resumable Firecrawl read. */
  extractJobId?: string
  extractLeadId?: string
  extractJobStartedAt?: string
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

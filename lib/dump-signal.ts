import type { Lead } from "./types"

export function dumpApisConfirmed(lead: Lead): boolean {
  return lead.apiConfirm?.exa === "confirmed" && lead.apiConfirm?.firecrawl === "confirmed"
}

/** Dump / similar names only reach OpenAI + Parallel after Exa and Firecrawl confirm the company. */
export function shouldClassifyLead(lead: Lead): boolean {
  if (lead.seed === "dump" || lead.seed === "similar") return dumpApisConfirmed(lead)
  return true
}

const DUMP_WINDOW_MS = 24 * 30 * 24 * 60 * 60 * 1000

/** Recent HS filings are cargo movement, not a Kanechom/LQ purchase. */
export function dumpShipmentsAreRecent(lead: Lead, now = Date.now()): boolean {
  const filing = lead.filing
  if (!filing) return false
  if (filing.lastTradeDate) {
    const stamp = Date.parse(filing.lastTradeDate)
    if (!Number.isNaN(stamp) && now - stamp <= DUMP_WINDOW_MS) return true
  }
  return (filing.latestMonths ?? []).some((month) => /202[5-6]/.test(month))
}

/** Confirmed dump shipments are a strong importer signal. They never fill last_purchase. */
export function dumpShipmentPoints(lead: Lead): number {
  const filing = lead.filing
  if (!filing) return 0
  const quality = filing.quality
  const shipments = filing.hsShipments ?? 0
  const confirmed = dumpApisConfirmed(lead)
  if (quality !== "usable" && quality !== "occupied") return confirmed ? 6 : 0
  if (!confirmed) return 8
  if (shipments >= 10) return 22
  if (shipments >= 3) return 18
  return 14
}

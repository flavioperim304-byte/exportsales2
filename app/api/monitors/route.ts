import { connection } from "next/server"
import { getKeys } from "@/lib/keys"
import {
  MONITOR_DAYS,
  MONITOR_EVENT,
  MONITOR_NUM_RESULTS,
  MONITOR_NUM_RESULTS_MAX,
  MONITOR_PERIOD,
  MONITOR_SIGNALS,
  MONITOR_USD_PER_RUN,
  TOP_PER_COUNTRY,
  monitorQuery,
  monitorsCreateAllowed,
  skippedMonitorCountries,
  watchLeadsForMonitors,
  webhookPublicUrl,
} from "@/lib/monitors"
import { publicMonitors, syncMonitors } from "@/lib/monitor-store"
import { listRuns } from "@/lib/store"

export const maxDuration = 60

export async function GET() {
  await connection()
  const runs = await listRuns()
  const watch = watchLeadsForMonitors(runs)
  const example = watch[0]
  return Response.json({
    webhookUrl: webhookPublicUrl(),
    period: MONITOR_PERIOD,
    days: MONITOR_DAYS,
    event: MONITOR_EVENT,
    signals: MONITOR_SIGNALS,
    queryExample: example ? monitorQuery(example.name, example.country) : monitorQuery("Premium Cosmetics", "Panama"),
    topPerCountry: TOP_PER_COUNTRY,
    triggerMode: "interval",
    companiesPerMonitor: 1,
    numResults: MONITOR_NUM_RESULTS,
    numResultsMax: MONITOR_NUM_RESULTS_MAX,
    usdPerRun: MONITOR_USD_PER_RUN,
    watch,
    skipped: skippedMonitorCountries(runs),
    monitors: publicMonitors(),
    exa: Boolean(getKeys().exa),
    createAllowed: monitorsCreateAllowed(),
  })
}

export async function POST() {
  await connection()
  const result = await syncMonitors()
  const status = result.errors.length && result.created === 0 && result.kept === 0 ? 400 : 200
  return Response.json(result, { status })
}

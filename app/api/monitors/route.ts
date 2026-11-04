import { connection } from "next/server"
import { getKeys } from "@/lib/keys"
import {
  MONITOR_EVENT,
  MONITOR_PERIOD,
  MONITOR_SIGNALS,
  monitorQuery,
  monitorsCreateAllowed,
  topLeadsByCountry,
  webhookPublicUrl,
} from "@/lib/monitors"
import { publicMonitors, syncMonitors } from "@/lib/monitor-store"
import { listRuns } from "@/lib/store"

export const maxDuration = 60

export async function GET() {
  await connection()
  const runs = await listRuns()
  const watch = topLeadsByCountry(runs)
  const example = watch[0]
  return Response.json({
    webhookUrl: webhookPublicUrl(),
    period: MONITOR_PERIOD,
    event: MONITOR_EVENT,
    signals: MONITOR_SIGNALS,
    queryExample: example ? monitorQuery(example.name, example.country) : monitorQuery("Premium Cosmetics", "Panama"),
    topPerCountry: 3,
    watch,
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

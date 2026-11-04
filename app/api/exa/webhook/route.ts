import { connection } from "next/server"
import { applyMonitorToRun, MONITOR_EVENT } from "@/lib/monitors"
import { findMonitorBySignature } from "@/lib/monitor-store"
import { updateRun } from "@/lib/store"

export const maxDuration = 30

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined
}

export async function POST(request: Request) {
  await connection()
  const payload = await request.text()
  const signature = request.headers.get("exa-signature") || request.headers.get("Exa-Signature") || ""
  const stored = findMonitorBySignature(payload, signature)
  if (!stored) {
    return Response.json({ error: "Invalid Exa signature." }, { status: 401 })
  }
  let event: unknown
  try {
    event = payload ? JSON.parse(payload) : null
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 })
  }
  const root = asRecord(event)
  const type = typeof root?.type === "string" ? root.type : ""
  if (type && type !== MONITOR_EVENT) {
    return Response.json({ ok: true, ignored: type })
  }
  const data = asRecord(root?.data)
  const output = data?.output
  const metadata = asRecord(data?.metadata)
  const runId = stored.runId || (typeof metadata?.runId === "string" ? metadata.runId : "")
  const leadId = stored.leadId || (typeof metadata?.leadId === "string" ? metadata.leadId : "")
  if (!runId || !leadId) {
    return Response.json({ ok: true, attached: 0, note: "Monitor has no lead routing." })
  }
  const attached = await updateRun(runId, (run) => applyMonitorToRun(run, leadId, output))
  return Response.json({ ok: true, attached: attached ?? 0, leadId, runId })
}

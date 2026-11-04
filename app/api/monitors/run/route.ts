import { connection } from "next/server"
import { triggerStoredMonitors } from "@/lib/monitor-store"

export const maxDuration = 60

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  await connection()
  if (!cronAuthorized(request)) {
    return Response.json(
      { error: "Set CRON_SECRET and send Authorization: Bearer … to trigger monitor runs." },
      { status: 401 }
    )
  }
  return Response.json(await triggerStoredMonitors())
}

export async function POST(request: Request) {
  return GET(request)
}

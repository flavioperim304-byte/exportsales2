import { connection } from "next/server"
import { postgresStatus } from "@/lib/lead-db"

export async function GET() {
  await connection()
  const status = await postgresStatus()
  return Response.json(status)
}

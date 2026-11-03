import { connection } from "next/server"
import { clearAtlasSession } from "@/lib/keys"

export async function POST() {
  await connection()
  return Response.json({ flags: clearAtlasSession() })
}

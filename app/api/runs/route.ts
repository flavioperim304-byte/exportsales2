import { connection } from "next/server"
import { validateBrief } from "@/lib/example"
import { getKeys } from "@/lib/keys"
import { startRun } from "@/lib/pipeline"

export async function POST(request: Request) {
  await connection()
  const body = await request.json().catch(() => null)
  const parsed = validateBrief(body)
  if (!parsed.brief) {
    return Response.json({ error: parsed.error ?? "Invalid brief." }, { status: 400 })
  }
  if (!getKeys().exa) {
    return Response.json(
      {
        error:
          "Add an Exa API key under Sources before a live run. The worked example on the desk is available without keys.",
      },
      { status: 400 }
    )
  }
  const run = await startRun(parsed.brief)
  return Response.json({ id: run.id })
}

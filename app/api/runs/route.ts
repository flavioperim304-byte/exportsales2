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
  const alsoBody =
    body && typeof body === "object" && "also" in body
      ? (body as { also?: unknown }).also
      : undefined
  const alsoParsed = alsoBody ? validateBrief(alsoBody) : undefined
  if (alsoParsed && !alsoParsed.brief) {
    return Response.json({ error: alsoParsed.error ?? "The second supplier brief is invalid." }, { status: 400 })
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
  const run = await startRun(parsed.brief, alsoParsed?.brief)
  return Response.json({ id: run.id })
}

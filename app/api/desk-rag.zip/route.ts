import { readFile, stat } from "node:fs/promises"
import path from "node:path"

const FILE = "desk-rag.zip"

function zipPath() {
  return path.join(process.cwd(), "public", FILE)
}

function zipHeaders(length: number) {
  return {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${FILE}"`,
    "Content-Length": String(length),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  }
}

export async function GET() {
  try {
    const body = await readFile(zipPath())
    return new Response(body, { headers: zipHeaders(body.length) })
  } catch {
    return Response.json({ error: "O zip ainda não está neste servidor." }, { status: 404 })
  }
}

export async function HEAD() {
  try {
    const info = await stat(zipPath())
    return new Response(null, { status: 200, headers: zipHeaders(info.size) })
  } catch {
    return new Response(null, { status: 404 })
  }
}

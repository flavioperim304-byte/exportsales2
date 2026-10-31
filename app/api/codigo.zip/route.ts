import { readFile } from "node:fs/promises"
import path from "node:path"

export async function GET() {
  const file = path.join(process.cwd(), "public", "export-desk.zip")
  try {
    const body = await readFile(file)
    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="export-desk.zip"',
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return Response.json({ error: "O zip ainda não está neste servidor." }, { status: 404 })
  }
}

import { readFile, stat } from "node:fs/promises"
import path from "node:path"

export function zipResponseHandlers(file: string) {
  const zipPath = () => path.join(process.cwd(), "public", file)

  function headers(length: number) {
    return {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Content-Length": String(length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    }
  }

  return {
    async GET() {
      try {
        const body = await readFile(zipPath())
        return new Response(body, { headers: headers(body.length) })
      } catch {
        return Response.json({ error: "O zip ainda não está neste servidor." }, { status: 404 })
      }
    },
    async HEAD() {
      try {
        const info = await stat(zipPath())
        return new Response(null, { status: 200, headers: headers(info.size) })
      } catch {
        return new Response(null, { status: 404 })
      }
    },
  }
}

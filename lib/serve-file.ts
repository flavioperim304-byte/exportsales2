import { readFile, stat } from "node:fs/promises"
import path from "node:path"

export function fileDownloadHandlers(rel: string, filename: string, contentType: string) {
  const filePath = () => path.join(/* turbopackIgnore: true */ process.cwd(), rel)

  function headers(length: number) {
    return {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    }
  }

  return {
    async GET() {
      try {
        const body = await readFile(filePath())
        return new Response(body, { headers: headers(body.length) })
      } catch {
        return Response.json({ error: "Arquivo ainda não está neste servidor." }, { status: 404 })
      }
    },
    async HEAD() {
      try {
        const info = await stat(filePath())
        return new Response(null, { status: 200, headers: headers(info.size) })
      } catch {
        return new Response(null, { status: 404 })
      }
    },
  }
}

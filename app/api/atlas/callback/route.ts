import { cookies } from "next/headers"
import { connection } from "next/server"
import { decodeAtlasOAuthCookie, finishAtlasOAuth } from "@/lib/atlas-client"

export async function GET(request: Request) {
  await connection()
  const url = new URL(request.url)
  const code = url.searchParams.get("code") || ""
  const state = url.searchParams.get("state") || ""
  const jar = await cookies()
  const pending = decodeAtlasOAuthCookie(jar.get("atlas_oauth")?.value || "")
  const clear = () => {
    jar.set("atlas_oauth", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 })
  }
  if (!code || !state || !pending) {
    clear()
    return Response.redirect(new URL("/sources?atlas=error&reason=missing_oauth", request.url), 302)
  }
  try {
    await finishAtlasOAuth(pending, code, state)
    clear()
    return Response.redirect(new URL("/sources?atlas=connected", request.url), 302)
  } catch (error) {
    clear()
    const reason = error instanceof Error ? error.message : "token"
    return Response.redirect(
      new URL(`/sources?atlas=error&reason=${encodeURIComponent(reason)}`, request.url),
      302
    )
  }
}

import { cookies } from "next/headers"
import { connection } from "next/server"
import { startAtlasOAuth } from "@/lib/atlas-client"

export async function GET(request: Request) {
  await connection()
  try {
    const started = await startAtlasOAuth(request)
    const jar = await cookies()
    jar.set("atlas_oauth", started.cookie, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    })
    return Response.redirect(started.authorizationUrl, 302)
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth"
    return Response.redirect(
      new URL(`/sources?atlas=error&reason=${encodeURIComponent(message)}`, request.url),
      302
    )
  }
}

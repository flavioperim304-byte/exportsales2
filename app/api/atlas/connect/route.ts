import { startAtlasOAuth } from "@/lib/atlas-client"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const started = await startAtlasOAuth(request)
    const response = Response.redirect(started.authorizationUrl, 302)
    response.headers.append(
      "Set-Cookie",
      `atlas_oauth=${started.cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
    )
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth"
    return Response.redirect(new URL(`/sources?atlas=error&reason=${encodeURIComponent(message)}`, request.url), 302)
  }
}

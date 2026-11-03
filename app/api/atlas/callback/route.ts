import { decodeAtlasOAuthCookie, finishAtlasOAuth } from "@/lib/atlas-client"

export const dynamic = "force-dynamic"

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("cookie") || ""
  const parts = header.split(/;\s*/)
  const hit = parts.find((part) => part.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ""
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code") || ""
  const state = url.searchParams.get("state") || ""
  const pending = decodeAtlasOAuthCookie(cookieValue(request, "atlas_oauth"))
  const clear = "atlas_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  const fail = (reason: string) => {
    const response = Response.redirect(new URL(`/sources?atlas=error&reason=${encodeURIComponent(reason)}`, request.url), 302)
    response.headers.append("Set-Cookie", clear)
    return response
  }
  if (!code || !state || !pending) return fail("missing_oauth")
  try {
    await finishAtlasOAuth(pending, code, state)
    const response = Response.redirect(new URL("/sources?atlas=connected", request.url), 302)
    response.headers.append("Set-Cookie", clear)
    return response
  } catch (error) {
    return fail(error instanceof Error ? error.message : "token")
  }
}

import { createHash, randomBytes } from "node:crypto"
import { ATLAS_MCP_URL, ATLAS_TOOLS, type AtlasToolClient } from "./company-atlas"
import { ApiError } from "./http"
import { getAtlasSession, saveAtlasSession } from "./keys"

export const ATLAS_AUTHORIZE = "https://thecompanyatlas.com/api/auth/mcp/authorize"
export const ATLAS_TOKEN = "https://thecompanyatlas.com/api/auth/mcp/token"
export const ATLAS_REGISTER = "https://thecompanyatlas.com/api/auth/mcp/register"
export const ATLAS_RESOURCE = "https://thecompanyatlas.com/mcp"

const PROTOCOL = "2025-03-26"

export type AtlasOAuthStart = {
  authorizationUrl: string
  cookie: string
}

type PendingOAuth = {
  verifier: string
  state: string
  clientId: string
  redirectUri: string
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function challenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest())
}

export function encodeAtlasOAuthCookie(pending: PendingOAuth): string {
  return base64url(Buffer.from(JSON.stringify(pending), "utf8"))
}

export function decodeAtlasOAuthCookie(value: string): PendingOAuth | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
    const parsed = JSON.parse(Buffer.from(padded + pad, "base64").toString("utf8")) as PendingOAuth
    if (!parsed?.verifier || !parsed.state || !parsed.clientId || !parsed.redirectUri) return null
    return parsed
  } catch {
    return null
  }
}

export function atlasCallbackUrl(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host
  return `${proto}://${host}/api/atlas/callback`
}

export async function registerAtlasClient(redirectUri: string): Promise<string> {
  const response = await fetch(ATLAS_REGISTER, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Export Desk",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openid profile email offline_access",
    }),
  })
  const data = (await response.json().catch(() => null)) as { client_id?: string } | null
  if (!response.ok || !data?.client_id) {
    throw new Error("Company Atlas recusou o registro OAuth deste desk.")
  }
  return data.client_id
}

export async function startAtlasOAuth(request: Request): Promise<AtlasOAuthStart> {
  const redirectUri = atlasCallbackUrl(request)
  const clientId = await registerAtlasClient(redirectUri)
  const verifier = base64url(randomBytes(32))
  const state = base64url(randomBytes(16))
  const pending: PendingOAuth = { verifier, state, clientId, redirectUri }
  const authorize = new URL(ATLAS_AUTHORIZE)
  authorize.searchParams.set("response_type", "code")
  authorize.searchParams.set("client_id", clientId)
  authorize.searchParams.set("redirect_uri", redirectUri)
  authorize.searchParams.set("scope", "openid profile email offline_access")
  authorize.searchParams.set("code_challenge", challenge(verifier))
  authorize.searchParams.set("code_challenge_method", "S256")
  authorize.searchParams.set("state", state)
  authorize.searchParams.set("resource", ATLAS_RESOURCE)
  return { authorizationUrl: authorize.toString(), cookie: encodeAtlasOAuthCookie(pending) }
}

async function tokenRequest(body: URLSearchParams): Promise<{
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
}> {
  const response = await fetch(ATLAS_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  })
  const data = (await response.json().catch(() => null)) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  } | null
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error || "Company Atlas não devolveu o token.")
  }
  return data
}

export async function finishAtlasOAuth(pending: PendingOAuth, code: string, state: string): Promise<void> {
  if (state !== pending.state) throw new Error("OAuth state mismatch.")
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.verifier,
    resource: ATLAS_RESOURCE,
  })
  const data = await tokenRequest(body)
  saveAtlasSession({
    access: data.access_token || "",
    refresh: data.refresh_token,
    clientId: pending.clientId,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined,
  })
}

export async function refreshAtlasAccess(session = getAtlasSession()): Promise<string | undefined> {
  if (!session.refresh || !session.clientId) return session.access || undefined
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.refresh,
    client_id: session.clientId,
    resource: ATLAS_RESOURCE,
  })
  const data = await tokenRequest(body)
  saveAtlasSession({
    access: data.access_token || "",
    refresh: data.refresh_token || session.refresh,
    clientId: session.clientId,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined,
  })
  return data.access_token
}

export async function ensureAtlasToken(): Promise<string | undefined> {
  const session = getAtlasSession()
  if (!session.access && !session.refresh) return undefined
  if (session.expiresAt) {
    const exp = Date.parse(session.expiresAt)
    if (!Number.isNaN(exp) && exp - 60_000 < Date.now() && session.refresh) {
      try {
        return await refreshAtlasAccess(session)
      } catch {
        return session.access || undefined
      }
    }
  }
  return session.access || undefined
}

function parseSseJson(text: string): unknown {
  const blocks = text.split(/\n\n+/)
  for (const block of blocks.reverse()) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("")
    if (!dataLines) continue
    try {
      return JSON.parse(dataLines) as unknown
    } catch {
      continue
    }
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { error: text.slice(0, 400) }
  }
}

async function mcpPost(
  token: string,
  body: Record<string, unknown>,
  sessionId?: string
): Promise<{ data: unknown; sessionId?: string; status: number }> {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL,
  })
  if (sessionId) headers.set("Mcp-Session-Id", sessionId)
  const response = await fetch(ATLAS_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const data = text.includes("data:") ? parseSseJson(text) : text ? parseSseJson(text) : null
  return {
    data,
    sessionId: response.headers.get("mcp-session-id") || sessionId,
    status: response.status,
  }
}

function rpcResult(data: unknown): unknown {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null
  if (!root) return data
  if (root.error && typeof root.error === "object") {
    const err = root.error as Record<string, unknown>
    throw new ApiError(typeof err.message === "string" ? err.message : "Company Atlas MCP error", 400)
  }
  return root.result ?? data
}

export async function createAtlasClient(token: string): Promise<AtlasToolClient> {
  const started = await mcpPost(token, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "export-desk", version: "0.1.0" },
    },
  })
  if (started.status === 401) {
    const refreshed = await refreshAtlasAccess()
    if (!refreshed || refreshed === token) {
      throw new ApiError("Company Atlas pediu login Google de novo.", 401)
    }
    return createAtlasClient(refreshed)
  }
  if (started.status >= 400) {
    throw new ApiError(`Company Atlas MCP returned ${started.status}`, started.status)
  }
  const sessionId = started.sessionId
  await mcpPost(
    token,
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    sessionId
  ).catch(() => undefined)

  return {
    async call(name: string, args: Record<string, unknown>) {
      const posted = await mcpPost(
        token,
        {
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: { name, arguments: args },
        },
        sessionId
      )
      if (posted.status >= 400) {
        throw new ApiError(`Company Atlas ${name} returned ${posted.status}`, posted.status)
      }
      return rpcResult(posted.data)
    },
  }
}

export { ATLAS_TOOLS }

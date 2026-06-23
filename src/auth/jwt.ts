import { SignJWT, jwtVerify } from "jose"

const ISSUER = "querygate"
const DEFAULT_TTL = "7d"

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET
  if (!raw) {
    throw new Error("JWT_SECRET is required for connection tokens")
  }
  return new TextEncoder().encode(raw)
}

export function getTokenTtlMs(): number {
  const days = Number(process.env.JWT_TTL_DAYS ?? "7")
  return days * 24 * 60 * 60 * 1000
}

/** Sign a JWT containing only the connection ID — no secrets in the payload. */
export async function signConnectionToken(connectionId: string): Promise<string> {
  const ttl = process.env.JWT_TTL_DAYS ? `${process.env.JWT_TTL_DAYS}d` : DEFAULT_TTL
  return new SignJWT({ cid: connectionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(getSecret())
}

export async function verifyConnectionToken(token: string): Promise<{ cid: string }> {
  const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER })
  if (typeof payload.cid !== "string" || payload.cid.length === 0) {
    throw new Error("Invalid token: missing connection id")
  }
  return { cid: payload.cid }
}

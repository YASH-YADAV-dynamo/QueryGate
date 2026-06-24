import { SignJWT, jwtVerify } from "jose"
import { encryptSecret, decryptSecret } from "../crypto/encrypt.js"

const ISSUER = "querygate"
const DEFAULT_TTL = "7d"

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET
  if (!raw) throw new Error("JWT_SECRET is required")
  return new TextEncoder().encode(raw)
}

export function getTokenTtlMs(): number {
  const days = Number(process.env.JWT_TTL_DAYS ?? "7")
  return days * 24 * 60 * 60 * 1000
}

function ttlString(): string {
  return process.env.JWT_TTL_DAYS ? `${process.env.JWT_TTL_DAYS}d` : DEFAULT_TTL
}

/**
 * Sign a self-contained token that carries the DB URL inside the payload.
 * If ENCRYPTION_KEY is set the URL is AES-256-GCM encrypted (claim "eu").
 * Otherwise it is stored plaintext (claim "u") — still signed, still tamper-proof.
 * No Prisma lookup is needed to recover the URL from this token.
 */
export async function signUrlToken(normalizedUrl: string): Promise<string> {
  let payload: Record<string, string>

  if (process.env.ENCRYPTION_KEY) {
    payload = { eu: encryptSecret(normalizedUrl) }
  } else {
    payload = { u: normalizedUrl }
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(ttlString())
    .sign(getSecret())
}

/**
 * Extract the DB URL from a self-contained token.
 * Returns null if the token is a legacy {cid} token that needs Prisma lookup.
 */
export async function verifyUrlToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER })

    if (typeof payload.eu === "string") {
      if (!process.env.ENCRYPTION_KEY) return null
      return decryptSecret(payload.eu)
    }

    if (typeof payload.u === "string") {
      return payload.u
    }

    return null // legacy {cid} token
  } catch {
    return null
  }
}

// ── Legacy functions (kept for backward-compat with old {cid} tokens) ─────────

/** @deprecated Use signUrlToken. Kept to resolve legacy tokens stored in Prisma. */
export async function signConnectionToken(connectionId: string): Promise<string> {
  return new SignJWT({ cid: connectionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(ttlString())
    .sign(getSecret())
}

/** @deprecated Used only for legacy {cid} token lookup via Prisma. */
export async function verifyConnectionToken(token: string): Promise<{ cid: string }> {
  const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER })
  if (typeof payload.cid !== "string" || payload.cid.length === 0) {
    throw new Error("Invalid token: missing connection id")
  }
  return { cid: payload.cid }
}

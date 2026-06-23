import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"

const SALT = "querygate-v1"

function deriveKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error("ENCRYPTION_KEY is required for connection storage")
  }
  return scryptSync(secret, SALT, 32)
}

/** AES-256-GCM encrypt — returns base64(iv + authTag + ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const key = deriveKey()
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

export function decryptSecret(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const key = deriveKey()
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}

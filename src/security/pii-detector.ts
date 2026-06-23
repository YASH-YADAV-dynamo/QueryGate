import type { PiiRisk } from "../db/types.js"

export const PII_PATTERNS: RegExp[] = [
  /email/i,
  /phone/i,
  /mobile/i,
  /ssn/i,
  /password/i,
  /passwd/i,
  /credit_card/i,
  /card_number/i,
  /cvv/i,
  /dob/i,
  /date_of_birth/i,
  /birth_date/i,
  /address/i,
  /ip_address/i,
  /passport/i,
  /national_id/i,
  /aadhaar/i,
  /pan_number/i,
  /social_security/i,
  /bank_account/i,
  /routing_number/i,
]

export function detectPii(columnName: string): PiiRisk {
  return PII_PATTERNS.some((p) => p.test(columnName)) ? "high" : "none"
}

/** Mask a value if its column is high-risk PII */
export function maskIfPii(value: unknown, piiRisk: PiiRisk): unknown {
  if (piiRisk !== "high") return value
  if (value === null || value === undefined) return value
  const str = String(value)
  if (str.length <= 4) return "***"
  return str.slice(0, 2) + "*".repeat(str.length - 4) + str.slice(-2)
}

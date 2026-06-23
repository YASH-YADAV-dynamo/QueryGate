// Pure keyword-based embeddings — no external API needed.
// The AI client (ChatGPT/Claude/Cursor) provides the intelligence.
// This server just needs "good enough" similarity for table retrieval.

import { createHash } from "crypto"
import { CONSTANTS } from "../config/index.js"
import { LRUCache } from "../cache/lru.js"

const embedCache = new LRUCache<string, number[]>({
  maxItems: 2000,
  maxBytes: CONSTANTS.EMBED_CACHE_MAX_BYTES,
  defaultTTL: 0,
  sizeOf: (v) => v.length * 8,
})

function cacheKey(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

/** 
 * Keyword-hash embedding (512-dim).
 * Good enough for table retrieval when question uses real table/column names.
 * The AI client already knows what tables exist from schema_reader output.
 */
function keywordEmbedding(text: string): number[] {
  const dim = 512
  const vec = new Array<number>(dim).fill(0)
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean)
  for (const tok of tokens) {
    let h = 0
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) | 0
    const idx = Math.abs(h) % dim
    vec[idx] = (vec[idx] ?? 0) + 1
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map((v) => v / norm)
}

export async function embedOne(text: string): Promise<number[]> {
  const key = cacheKey(text)
  const cached = embedCache.get(key)
  if (cached) return cached
  const vec = keywordEmbedding(text)
  embedCache.set(key, vec)
  return vec
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map(embedOne))
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += (a[i] ?? 0) * (b[i] ?? 0)
    normA += (a[i] ?? 0) ** 2
    normB += (b[i] ?? 0) ** 2
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

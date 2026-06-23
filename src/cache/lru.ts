export type EvictReason = "lru" | "ttl" | "size"

export interface LRUOptions<K, V> {
  maxItems: number
  maxBytes: number
  defaultTTL: number // ms, 0 = immortal
  onEvict?: (key: K, value: V, reason: EvictReason) => void
  sizeOf?: (value: V) => number
}

interface LRUNode<K, V> {
  key: K
  value: V
  bytes: number
  hits: number
  expires: number // absolute ms, 0 = no expiry
  prev: LRUNode<K, V> | null
  next: LRUNode<K, V> | null
}

export interface CacheStats {
  items: number
  bytes: number
  hits: number
  misses: number
  evictions: number
  hitRate: number
}

export class LRUCache<K, V> {
  private map = new Map<K, LRUNode<K, V>>()
  private head: LRUNode<K, V> | null = null // most recent
  private tail: LRUNode<K, V> | null = null // least recent
  private totalBytes = 0
  private hits = 0
  private misses = 0
  private evictions = 0

  constructor(private readonly opts: LRUOptions<K, V>) {}

  get(key: K): V | undefined {
    const node = this.map.get(key)
    if (!node) {
      this.misses++
      return undefined
    }
    if (node.expires > 0 && Date.now() > node.expires) {
      this.evict(node, "ttl")
      this.misses++
      return undefined
    }
    this.promote(node)
    node.hits++
    this.hits++
    return node.value
  }

  set(key: K, value: V, ttlMs?: number): void {
    const existing = this.map.get(key)
    if (existing) this.evict(existing, "lru")

    const bytes = this.opts.sizeOf
      ? this.opts.sizeOf(value)
      : JSON.stringify(value).length * 2

    const ttl = ttlMs ?? this.opts.defaultTTL
    const node: LRUNode<K, V> = {
      key,
      value,
      bytes,
      hits: 0,
      expires: ttl > 0 ? Date.now() + ttl : 0,
      prev: null,
      next: this.head,
    }

    if (this.head) this.head.prev = node
    this.head = node
    if (!this.tail) this.tail = node

    this.map.set(key, node)
    this.totalBytes += bytes

    this.enforceLimits()
  }

  delete(key: K): boolean {
    const node = this.map.get(key)
    if (!node) return false
    this.evict(node, "lru")
    return true
  }

  /** Remove all keys whose string representation starts with prefix */
  invalidatePrefix(prefix: string): number {
    let count = 0
    for (const key of this.map.keys()) {
      if (String(key).startsWith(prefix)) {
        this.delete(key)
        count++
      }
    }
    return count
  }

  purgeExpired(): number {
    const now = Date.now()
    let count = 0
    for (const node of this.map.values()) {
      if (node.expires > 0 && now > node.expires) {
        this.evict(node, "ttl")
        count++
      }
    }
    return count
  }

  stats(): CacheStats {
    const total = this.hits + this.misses
    return {
      items: this.map.size,
      bytes: this.totalBytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total === 0 ? 0 : this.hits / total,
    }
  }

  clear(): void {
    for (const node of this.map.values()) {
      this.opts.onEvict?.(node.key, node.value, "lru")
    }
    this.map.clear()
    this.head = null
    this.tail = null
    this.totalBytes = 0
  }

  private promote(node: LRUNode<K, V>): void {
    if (node === this.head) return
    this.unlink(node)
    node.next = this.head
    node.prev = null
    if (this.head) this.head.prev = node
    this.head = node
    if (!this.tail) this.tail = node
  }

  private unlink(node: LRUNode<K, V>): void {
    if (node.prev) node.prev.next = node.next
    else this.head = node.next
    if (node.next) node.next.prev = node.prev
    else this.tail = node.prev
    node.prev = null
    node.next = null
  }

  private evict(node: LRUNode<K, V>, reason: EvictReason): void {
    this.unlink(node)
    this.map.delete(node.key)
    this.totalBytes -= node.bytes
    this.evictions++
    this.opts.onEvict?.(node.key, node.value, reason)
  }

  private enforceLimits(): void {
    while (
      this.tail &&
      (this.map.size > this.opts.maxItems || this.totalBytes > this.opts.maxBytes)
    ) {
      this.evict(this.tail, this.totalBytes > this.opts.maxBytes ? "size" : "lru")
    }
  }
}

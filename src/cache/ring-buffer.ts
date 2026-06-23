export class RingBuffer<T> {
  private buf: (T | undefined)[]
  private head = 0
  private count = 0

  constructor(private readonly capacity: number) {
    this.buf = new Array(capacity)
  }

  push(item: T): void {
    this.buf[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
  }

  /** Most recent n items, newest first */
  last(n: number): T[] {
    const out: T[] = []
    const take = Math.min(n, this.count)
    for (let i = 0; i < take; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity
      const item = this.buf[idx]
      if (item !== undefined) out.push(item)
    }
    return out
  }

  clear(): void {
    this.buf = new Array(this.capacity)
    this.head = 0
    this.count = 0
  }

  get size(): number {
    return this.count
  }
}

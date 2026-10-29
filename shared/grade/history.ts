// The panel's own undo/redo (FR20): one entry per completed gesture. Designer's undo is
// separate and unaffected. Entries are stored as JSON, which also makes them immutable.

export const HISTORY_LIMIT = 100 // spec minimum is 50

export class History<T> {
  private entries: string[]
  private index = 0
  private readonly limit: number

  constructor(initial: T, limit = HISTORY_LIMIT) {
    this.entries = [JSON.stringify(initial)]
    this.limit = limit
  }

  get current(): T {
    return JSON.parse(this.entries[this.index]!) as T
  }

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1
  }

  /** Records a completed gesture. Returns false (and records nothing) if nothing changed. */
  commit(state: T): boolean {
    const json = JSON.stringify(state)
    if (json === this.entries[this.index]) return false
    this.entries.splice(this.index + 1)
    this.entries.push(json)
    if (this.entries.length > this.limit + 1) this.entries.shift()
    this.index = this.entries.length - 1
    return true
  }

  undo(): T | undefined {
    if (!this.canUndo) return undefined
    this.index--
    return this.current
  }

  redo(): T | undefined {
    if (!this.canRedo) return undefined
    this.index++
    return this.current
  }

  /** Clears history, e.g. after a layer change: undo never crosses layers. */
  reset(state: T): void {
    this.entries = [JSON.stringify(state)]
    this.index = 0
  }
}

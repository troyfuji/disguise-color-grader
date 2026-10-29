// The panel's only network link: a WebSocket to the colour-grader server (never to disguise).
// Reconnects with back-off from 1 s up to 10 s.

import { PANEL_WS_PATH, type PanelMessage, type ServerMessage } from '@shared/protocol'

export type LinkState = 'connecting' | 'open' | 'closed'

const BACKOFF_MIN_MS = 1000
const BACKOFF_MAX_MS = 10000

export function panelUrl(loc: Location = window.location): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}${PANEL_WS_PATH}`
}

export class PanelConnection {
  private ws: WebSocket | null = null
  private backoff = BACKOFF_MIN_MS
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly url: string
  private readonly onMessage: (msg: ServerMessage) => void
  private readonly onState: (s: LinkState) => void

  constructor(url: string, onMessage: (msg: ServerMessage) => void, onState: (s: LinkState) => void) {
    this.url = url
    this.onMessage = onMessage
    this.onState = onState
    this.open()
  }

  send(msg: PanelMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(msg))
    return true
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = null
      ws.close()
    }
    this.onState('closed')
  }

  private open(): void {
    this.onState('connecting')
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.onopen = () => {
      this.backoff = BACKOFF_MIN_MS
      this.onState('open')
    }
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(String(ev.data)) as ServerMessage)
      } catch {
        // ignore malformed message
      }
    }
    ws.onclose = () => {
      this.ws = null
      this.onState('connecting')
      const wait = this.backoff
      this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS)
      this.timer = setTimeout(() => this.open(), wait)
    }
  }
}

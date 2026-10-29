// Colour Grader server — standalone, runs on the operator's laptop (decision D17).
//
//   npm start                                  http://0.0.0.0:8080
//   node server/main.ts --port 8080 --host 0.0.0.0 --director 192.168.10.11
//
// Serves the panel page (dist/) to tablets and laptops on the show network, and is the only
// thing that talks to disguise. Panels connect to ws://<this server>/api/panel.

import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { PANEL_WS_PATH, type PanelMessage, type ServerMessage } from '../shared/protocol.ts'
import { PresetStore } from './presets.ts'
import { GradingSession } from './session.ts'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!, process.argv[i + 1] ?? '')
// Same convention as Strata: HOST / PORT (and DIRECTOR) from the environment; flags win.
const host = args.get('--host') || process.env.HOST || '0.0.0.0'
const port = Number(args.get('--port') || process.env.PORT || 8080)
const initialDirector = args.get('--director') || process.env.DIRECTOR || ''
const staticDir = resolve(root, args.get('--static') || 'dist')
const stateFile = resolve(root, args.get('--state') || 'data/server-state.json')
const presetsFile = resolve(root, args.get('--presets') || 'data/presets.json')

const log = (line: string) => console.log(`[colour-grader] ${line}`)

// ── remembered Director address (FR2) ────────────────────────────────────────

function loadSavedAddress(): string {
  try {
    return (JSON.parse(readFileSync(stateFile, 'utf8')) as { director?: string }).director ?? ''
  } catch {
    return ''
  }
}

function saveAddress(director: string): void {
  try {
    mkdirSync(dirname(stateFile), { recursive: true })
    writeFileSync(stateFile, JSON.stringify({ director }, null, 2))
  } catch (err) {
    log(`could not save state: ${String(err)}`)
  }
}

// ── session ──────────────────────────────────────────────────────────────────

const presets = new PresetStore(presetsFile, log)
log(`${presets.list.length} presets in ${presetsFile}`)
const session = new GradingSession({ version: pkg.version, onAddressChange: saveAddress, log, presets })

// ── HTTP: static page + health ───────────────────────────────────────────────

const contentTypes: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const http = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname === '/api/health') {
    const body = JSON.stringify({ ok: true, version: pkg.version, session: session.snapshot, director: session.directorStats })
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(body)
    return
  }
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  let target = resolve(staticDir, relative)
  if (target !== staticDir && !target.startsWith(staticDir + sep)) {
    res.writeHead(400).end('Invalid path')
    return
  }
  if (!existsSync(target) || statSync(target).isDirectory()) target = join(staticDir, 'index.html')
  if (!existsSync(target)) {
    res.writeHead(404).end('Panel not built. Run: npm run build (or use npm run dev)')
    return
  }
  res.writeHead(200, { 'Content-Type': contentTypes[extname(target)] || 'application/octet-stream' })
  createReadStream(target).pipe(res)
})

// ── WebSocket: panels ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: http, path: PANEL_WS_PATH, maxPayload: 256 * 1024 })

wss.on('connection', (ws) => {
  const id = randomUUID().slice(0, 8)
  session.attach({
    id,
    send: (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
    },
  })
  log(`panel ${id} connected (${wss.clients.size} open)`)
  ws.on('message', (raw) => {
    let msg: PanelMessage
    try {
      msg = JSON.parse(String(raw)) as PanelMessage
    } catch {
      return
    }
    if (msg && typeof msg.type === 'string') session.handle(id, msg)
  })
  ws.on('close', () => {
    session.detach(id)
    log(`panel ${id} disconnected`)
  })
})

http.listen(port, host, () => {
  const shown = host === '0.0.0.0' ? '127.0.0.1' : host
  console.log(`Colour Grader server v${pkg.version} running at http://${shown}:${port}`)
  const director = initialDirector || loadSavedAddress()
  if (director) {
    log(`connecting to Director ${director}`)
    session.connect(director)
  } else log('no Director address yet — enter one in the page and click Connect')
})

http.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Pick another, e.g.  .\\Start-Grader.ps1 -Port 8090`)
    process.exit(1)
  }
  console.error(`Colour Grader server failed to start: ${err.message}`)
  process.exit(1)
})

const shutdown = () => {
  session.disconnect() // unsubscribes everything (DISGUISE_API §7 rule 4)
  setTimeout(() => process.exit(0), 200) // let the close frames flush
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(signal, shutdown)

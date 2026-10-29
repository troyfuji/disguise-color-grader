// npm run dev — starts the Colour Grader server (restarts on change) and the Vite panel dev
// server together, like Strata's `npm run dev`. HOST / PORT / DIRECTOR come from the
// environment (Start-Grader.ps1 sets them). Pass --mock to also start the mock Director and
// connect to it.

import { spawn } from 'node:child_process'

const mock = process.argv.includes('--mock')
const port = process.env.PORT || '8080'
const env = { ...process.env, PORT: port, GRADER_SERVER_PORT: port }
if (mock && !env.DIRECTOR) env.DIRECTOR = 'localhost:8090'

const procs = [
  spawn(process.execPath, ['--watch', 'server/main.ts'], { stdio: 'inherit', env }),
  spawn('npx vite', { stdio: 'inherit', shell: true, env }),
]
if (mock) procs.push(spawn(process.execPath, ['tools/mock-director/server.mjs'], { stdio: 'inherit', env }))

const stop = () => {
  for (const p of procs) p.kill()
  process.exit(0)
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, stop)
for (const p of procs) p.on('exit', (code) => code && stop())

import { serve } from '@hono/node-server'
import { fileURLToPath } from 'node:url'
import { createStandaloneApplication } from './application.js'
import { configuration } from './config.js'

const config = configuration(fileURLToPath(new URL('../', import.meta.url)))
const runtime = await createStandaloneApplication(config)
const main = serve({ fetch: runtime.app.fetch, hostname: '127.0.0.1', port: config.appPort })
const bridge = serve({ fetch: runtime.bridge.fetch, hostname: config.bridgeBind, port: config.bridgePort })
console.log('Open the private app launcher: ' + runtime.launchFile)
console.log('myMind bridge: ' + config.bridgeEndpoint)
let closing = false
const close = () => {
  if (closing) return
  closing = true
  main.close(); bridge.close()
  const deadline = setTimeout(() => process.exit(0), 2000)
  deadline.unref()
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
for (const server of [main, bridge]) server.on('error', () => {
  console.error('App could not bind its configured ports.')
  main.close(); bridge.close(); process.exitCode = 1
})

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getCookie, setCookie } from 'hono/cookie'
import { stringify } from 'yaml'
import { z } from 'zod'
import { ItemStore, IdentitySchema, type Identity } from './domain.js'
import { createIntegration } from './bridge.js'

export interface ApplicationOptions {
  rootDirectory: string
  dataDirectory: string
  appOrigin: string
  bridgeEndpoint: string
  localIdentity: Identity
}
const HostDecision = z.object({ hostId: z.string().min(1).max(128), fingerprint: z.string().min(1).max(200),
  issuer: z.string().trim().max(200), approve: z.boolean(),
}).strict()

export async function createStandaloneApplication(options: ApplicationOptions) {
  const identity = IdentitySchema.parse(options.localIdentity)
  const origin = new URL(options.appOrigin)
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') throw new Error('local_ui_origin_invalid')
  await mkdir(options.dataDirectory, { recursive: true, mode: 0o700 })
  const store = new ItemStore(resolve(options.dataDirectory, 'items.json'))
  await store.load()
  const integration = await createIntegration(options.rootDirectory, options.dataDirectory, store, options.bridgeEndpoint)
  const app = new Hono()
  const session = randomBytes(32).toString('hex')
  const sessionMatches = (value: string): boolean => {
    const given = Buffer.from(value), expected = Buffer.from(session)
    return given.length === expected.length && timingSafeEqual(given, expected)
  }
  app.use('*', async (context, next) => {
    // The privileged local settings surface never accepts a proxy/other Host.
    if (context.req.header('host') !== origin.host) return context.text('Invalid host', 400)
    context.header('Cache-Control', 'no-store')
    context.header('X-Content-Type-Options', 'nosniff')
    context.header('Referrer-Policy', 'no-referrer')
    context.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'")
    await next()
  })
  app.use('/api/*', bodyLimit({ maxSize: 16384 }))
  app.use('/api/*', async (context, next) => {
    if (!sessionMatches(getCookie(context, 'app_session') ?? '')) return context.json({ error: 'local_session_required' }, 401)
    if (context.req.method !== 'GET' && (context.req.header('origin') !== options.appOrigin || context.req.header('x-app-action') !== '1'))
      return context.json({ error: 'local_origin_required' }, 403)
    await next()
  })
  app.post('/session', context => {
    if (context.req.header('origin') !== options.appOrigin || context.req.header('x-app-action') !== '1' ||
        !sessionMatches((context.req.header('authorization') ?? '').replace(/^Bearer /, ''))) return context.json({ error: 'local_access_required' }, 401)
    setCookie(context, 'app_session', session, { httpOnly: true, sameSite: 'Strict', path: '/' })
    return context.json({ authenticated: true })
  })
  app.get('/', async context => {
    return context.html(await readFile(resolve(options.rootDirectory, 'dist/public/index.html'), 'utf8'))
  })
  app.get('/app.js', async context => {
    context.header('Content-Type', 'text/javascript; charset=utf-8')
    return context.body(await readFile(resolve(options.rootDirectory, 'dist/public/app.js'), 'utf8'))
  })
  app.get('/api/config', context => context.json({ appId: integration.manifest.id, identity, bridgeEndpoint: options.bridgeEndpoint }))
  app.get('/api/items', async context => context.json({ items: await store.list(identity) }))
  app.post('/api/items', async context => context.json({ item: await store.create(identity, await context.req.json()) }))
  app.get('/api/hosts', async context => context.json({ hosts: (await integration.registry.list()).map(record => ({
    hostId: record.host_id, fingerprint: record.fingerprint, status: record.status,
    issuer: record.expected_issuer ?? '',
  })) }))
  app.post('/api/hosts/decision', async context => {
    const decision = HostDecision.parse(await context.req.json())
    if (decision.approve) await integration.registry.approveFingerprint(decision.hostId, decision.fingerprint, decision.issuer)
    else await integration.registry.rejectFingerprint(decision.hostId, decision.fingerprint)
    return context.json({ accepted: true })
  })
  app.get('/api/manifest', context => {
    context.header('Content-Type', 'application/yaml; charset=utf-8')
    context.header('Content-Disposition', 'attachment; filename="manifest.standalone-notes-app.yaml"')
    return context.body(stringify(integration.manifest))
  })
  app.onError((_error, context) => context.json({ error: 'operation_failed' }, 400))
  // Owner-only bootstrap, never delivered by the public HTTP surface. The
  // fragment is removed before API use and is not sent in requests/referrers.
  const launchUrl = options.appOrigin + '/#session=' + session
  const launchFile = resolve(options.dataDirectory, 'open-app.html')
  await writeFile(launchFile, '<!doctype html><html lang=de><meta charset=utf-8><title>App öffnen</title><a href="' + launchUrl + '">StandaloneNotesApp öffnen</a></html>', { mode: 0o600 })
  return { app, ...integration, store, launchUrl, launchFile }
}

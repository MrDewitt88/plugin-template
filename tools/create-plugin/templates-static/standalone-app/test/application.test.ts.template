import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestRegistry } from '@nexus-mindgarden/plugin-bridge-foundation/testing'
import { createStandaloneApplication } from '../src/application.js'
import { APP_ID } from '../src/bridge.js'

const identity = { tenantId: '00000000-0000-4000-8000-000000000001', userId: '00000000-0000-4000-8000-000000000002' }
const origin = 'http://127.0.0.1:3671'
const directories: string[] = []
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }) })
async function fixture() {
  const dataDirectory = await mkdtemp(resolve(tmpdir(), 'mcpi-app-'))
  directories.push(dataDirectory)
  const options = { rootDirectory: resolve('.'), dataDirectory, appOrigin: origin, bridgeEndpoint: 'http://127.0.0.1:3670', localIdentity: identity }
  const runtime = await createStandaloneApplication(options)
  const main = await runtime.app.request(origin + '/', { headers: { host: '127.0.0.1:3671' } })
  expect(main.headers.get('set-cookie')).toBeNull()
  const bootstrap = new URL(runtime.launchUrl).hash.slice('#session='.length)
  const login = await runtime.app.request(origin + '/session', { method: 'POST', headers: { host: '127.0.0.1:3671', origin, 'x-app-action': '1', authorization: 'Bearer ' + bootstrap } })
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!
  const local = (path: string, body?: unknown, extra: Record<string, string> = {}) => runtime.app.request(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { host: '127.0.0.1:3671', cookie, origin, 'x-app-action': '1', 'content-type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const host = await buildTestRegistry({ hostId: 'theseus' })
  await runtime.registry.register({ host_id: 'theseus', public_key_pem: host.publicKeyPem, expected_issuer: 'theseus-instance' })
  const record = (await runtime.registry.list())[0]!
  const approve = () => local('/api/hosts/decision', { hostId: record.host_id, fingerprint: record.fingerprint, issuer: 'theseus-instance', approve: true })
  const token = (scopes: string[] = ['mcp.read.' + APP_ID, 'mcp.write.' + APP_ID + '.items'], userId = identity.userId, pluginId = APP_ID) => host.mintToken({
    pluginId, tenantId: identity.tenantId, userId, sub: userId, aud: pluginId, iss: 'theseus-instance', scopes,
  })
  const call = (bearer: string, name: string, args: Record<string, unknown> = {}) => runtime.bridge.request('/plugin-bridge/v1/execute-tool', {
    method: 'POST', headers: { authorization: 'Bearer ' + bearer, 'content-type': 'application/json' },
    // Spoofed body IDs cannot select storage for another user.
    body: JSON.stringify({ tool_name: name, arguments: args, tenant_id: identity.tenantId, user_id: '00000000-0000-4000-8000-000000000099' }),
  })
  return { runtime, options, local, host, record, approve, token, call }
}

describe('standalone app and myMind boundary', () => {
  it('works without myMind; persists the same owner data over restart', async () => {
    const f = await fixture()
    expect((await f.local('/api/items', { text: 'From primary UI' })).status).toBe(200)
    const restarted = await createStandaloneApplication(f.options)
    expect(await restarted.store.list(identity)).toMatchObject([{ text: 'From primary UI' }])
    expect((await restarted.registry.list())[0]!.status).toBe('pending')
  })
  it('requires fingerprint approval, exact audience, read/write grants and signed identity', async () => {
    const f = await fixture(), token = await f.token()
    expect((await f.call(token, 'items.list')).status).toBe(401)
    expect((await f.approve()).status).toBe(200)
    expect((await f.call(await f.token(['mcp.read.' + APP_ID]), 'items.create', { text: 'Denied' })).status).toBe(403)
    expect((await f.call(await f.token(undefined, identity.userId, 'other-app'), 'items.list')).status).toBe(401)
    expect((await f.call(token, 'items.create', { text: 'From myMind' })).status).toBe(200)
    expect(await (await f.local('/api/items')).json()).toMatchObject({ items: [{ text: 'From myMind' }] })
    const stranger = await f.token(undefined, '00000000-0000-4000-8000-000000000003')
    expect(await (await f.call(stranger, 'items.list')).json()).toMatchObject({ ok: true, result: { structuredContent: { items: [] } } })
    const restarted = await createStandaloneApplication(f.options)
    expect((await restarted.registry.list())[0]!.status).toBe('active')
  })
  it('rejects stale fingerprint approvals after key rotation', async () => {
    const f = await fixture()
    await f.approve()
    const rotated = await buildTestRegistry({ hostId: 'theseus' })
    await f.runtime.registry.register({ host_id: 'theseus', public_key_pem: rotated.publicKeyPem, expected_issuer: 'theseus-instance' })
    expect((await f.approve()).status).toBe(400)
    expect((await f.call(await f.token(), 'items.list')).status).toBe(401)
  })
  it('protects local management from foreign origins, forged Host headers and missing sessions', async () => {
    const f = await fixture()
    expect((await f.runtime.app.request(origin + '/session', { method: 'POST', headers: { host: '127.0.0.1:3671', origin, 'x-app-action': '1' } })).status).toBe(401)
    expect((await f.local('/api/items', { text: 'Denied' }, { origin: 'https://foreign.example' })).status).toBe(403)
    expect((await f.local('/api/hosts', undefined, { host: 'foreign.example' })).status).toBe(400)
    expect((await f.local('/api/items', undefined, { cookie: '' })).status).toBe(401)
    expect((await f.local('/api/items', { text: 'Denied' }, { 'x-app-action': '' })).status).toBe(403)
  })
})

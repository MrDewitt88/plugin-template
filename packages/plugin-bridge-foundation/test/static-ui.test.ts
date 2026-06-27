import { Hono } from 'hono'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { staticUiHandler } from '../src/endpoints/static-ui.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'plug-tmpl-static-'))
  await writeFile(join(dir, 'bundle.js'), 'console.log("hi")', 'utf-8')
  await mkdir(join(dir, 'sub'), { recursive: true })
  await writeFile(join(dir, 'sub', 'nested.css'), 'a{color:red}', 'utf-8')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function mountApp(staticDir: string, urlPrefix?: string): Hono {
  const app = new Hono()
  const handler = staticUiHandler(urlPrefix ? { staticDir, urlPrefix } : { staticDir })
  const prefix = (urlPrefix ?? '/static/ui').replace(/\/$/, '')
  app.get(`${prefix}/*`, handler)
  return app
}

describe('staticUiHandler', () => {
  it('serves files with correct content-type + immutable cache', async () => {
    const app = mountApp(dir)
    const res = await app.request('/static/ui/bundle.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/javascript')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await res.text()).toContain('hi')
  })

  it('handles nested paths', async () => {
    const app = mountApp(dir)
    const res = await app.request('/static/ui/sub/nested.css')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/css')
  })

  it('returns 404 with canonical Drift #103 shape for missing files', async () => {
    const app = mountApp(dir)
    const res = await app.request('/static/ui/missing.js')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toMatchObject({ error: { code: 'not_found' } })
  })

  it('rejects URL-encoded path-traversal with 403', async () => {
    const app = mountApp(dir)
    // URL-encoded `..%2F..%2Fetc/passwd` survives Hono path-normalization
    // and exercises our path-traversal protection.
    const res = await app.request('/static/ui/%2e%2e%2f%2e%2e%2fetc/passwd')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toMatchObject({ error: { code: 'forbidden' } })
  })

  it('respects custom urlPrefix', async () => {
    const app = mountApp(dir, '/assets')
    const res = await app.request('/assets/bundle.js')
    expect(res.status).toBe(200)
  })

  it('respects custom cacheControl', async () => {
    const app = new Hono()
    const handler = staticUiHandler({ staticDir: dir, cacheControl: 'no-cache' })
    app.get('/static/ui/*', handler)
    const res = await app.request('/static/ui/bundle.js')
    expect(res.headers.get('cache-control')).toBe('no-cache')
  })

  it('serves .wasm with application/wasm content-type', async () => {
    await writeFile(join(dir, 'mod.wasm'), 'x', 'utf-8')
    const app = mountApp(dir)
    const res = await app.request('/static/ui/mod.wasm')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/wasm')
  })
})

describe('staticUiHandler — allowedExtensions (v0.8.0, markview #5348b)', () => {
  function mountAllow(staticDir: string, allowedExtensions?: readonly string[]): Hono {
    const app = new Hono()
    app.get('/static/ui/*', staticUiHandler({ staticDir, allowedExtensions }))
    return app
  }

  it('omitted → permissive (serves any existing file, octet-stream fallback)', async () => {
    await writeFile(join(dir, 'secret.env'), 'KEY=1', 'utf-8')
    const app = mountAllow(dir) // no allowlist
    const res = await app.request('/static/ui/secret.env')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
  })

  it('set → allowed extension served', async () => {
    const app = mountAllow(dir, ['.js', '.css', '.map', '.wasm'])
    const res = await app.request('/static/ui/bundle.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hi')
  })

  it('set → disallowed extension 404 (no existence leak for secret.env)', async () => {
    await writeFile(join(dir, 'secret.env'), 'KEY=1', 'utf-8')
    const app = mountAllow(dir, ['.js', '.css', '.map', '.wasm'])
    const res = await app.request('/static/ui/secret.env')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } })
  })

  it('extension match is case-insensitive', async () => {
    await writeFile(join(dir, 'B.JS'), 'x', 'utf-8')
    const app = mountAllow(dir, ['.js'])
    const res = await app.request('/static/ui/B.JS')
    expect(res.status).toBe(200)
  })

  it('allowlist blocks pure dotfile (.env) + extensionless file (extname → "")', async () => {
    // extname('.env') === '' and extname('LICENSE') === '' — must NOT slip past a configured allowlist.
    await writeFile(join(dir, '.env'), 'KEY=1', 'utf-8')
    await writeFile(join(dir, 'LICENSE'), 'MIT', 'utf-8')
    const app = mountAllow(dir, ['.js', '.css'])
    expect((await app.request('/static/ui/.env')).status).toBe(404)
    expect((await app.request('/static/ui/LICENSE')).status).toBe(404)
  })
})

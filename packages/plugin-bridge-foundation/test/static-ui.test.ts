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
})

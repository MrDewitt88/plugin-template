import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scaffold, ScaffoldError } from '../src/scaffolders/scaffold.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'create-plugin-test-'))
})

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('scaffold', () => {
  it('schreibt root files + bridge package by default', () => {
    const target = join(tmpDir, 'my-plugin')
    const r = scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind'],
      features: ['bridge'],
      target,
    })
    expect(r.target).toBe(target)
    expect(existsSync(join(target, 'package.json'))).toBe(true)
    expect(existsSync(join(target, 'pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(join(target, 'tsconfig.base.json'))).toBe(true)
    expect(existsSync(join(target, 'README.md'))).toBe(true)
    expect(existsSync(join(target, 'CLAUDE.md'))).toBe(true)
    // manifest.<id>.yaml (CODEX-REV §13.8) — NOT the bare manifest.yaml
    expect(existsSync(join(target, 'manifest.my-plugin.yaml'))).toBe(true)
    expect(existsSync(join(target, 'manifest.yaml'))).toBe(false)
    expect(existsSync(join(target, 'docs/ARCHITECTURE.md'))).toBe(true)
    // Node 24 pins + notices + bundle packer (static asset)
    expect(existsSync(join(target, '.node-version'))).toBe(true)
    expect(existsSync(join(target, '.nvmrc'))).toBe(true)
    expect(existsSync(join(target, 'NOTICES'))).toBe(true)
    expect(existsSync(join(target, 'scripts/pack-bundle.mjs'))).toBe(true)
    // bridge package
    expect(existsSync(join(target, 'packages/my-plugin-bridge/package.json'))).toBe(true)
    const bridgeIndex = readFileSync(
      join(target, 'packages/my-plugin-bridge/src/index.ts'),
      'utf-8',
    )
    // host-managed activation: auto-accept the host when spawned with a port
    // (else register-host lands on `pending` → handshake host_pending deadlock).
    expect(bridgeIndex).toContain('PLUGIN_BRIDGE_PORT')
    expect(bridgeIndex).toContain('autoAccept')
    // host-authoritative data dir — data outside the bundle survives updates
    expect(bridgeIndex).toContain('resolveDataDir')
    expect(bridgeIndex).toContain('PLUGIN_DATA_DIR')
    // D1: bind tokens to our own plugin id. The foundation only enforces `aud`
    // when the host registered an expected_audience — so the plugin must guard
    // itself, and the guard must WRAP the bridge (Hono runs in registration order).
    expect(bridgeIndex).toContain('audGuard')
    expect(bridgeIndex).toContain("app.route('/', bridge)")
    expect(bridgeIndex).not.toContain('bridge.use(audGuard')
  })

  it('renders {{pluginName}}-placeholders korrekt', () => {
    const target = join(tmpDir, 'cool-plugin')
    scaffold({
      pluginName: 'cool-plugin',
      hosts: ['teammind'],
      features: ['bridge'],
      target,
    })
    const pkg = readFileSync(join(target, 'package.json'), 'utf-8')
    expect(pkg).toContain('"name": "cool-plugin"')
    const manifest = readFileSync(join(target, 'manifest.cool-plugin.yaml'), 'utf-8')
    expect(manifest).toContain('id: cool-plugin')
    expect(manifest).toContain('apps: [teammind]')
    expect(manifest).toContain('service_endpoint: http://127.0.0.1:3600')
    // A4: min_app_version must not lock out rc builds (prerelease < release,
    // so `1.0.0` would exclude every current 1.0.0-rc.N host).
    expect(manifest).toContain('min_app_version: 1.0.0-rc.1')
    expect(manifest).not.toMatch(/min_app_version: 1\.0\.0\s*$/m)
  })

  it('renders {{pluginNamePascal}} in CLAUDE.md', () => {
    const target = join(tmpDir, 'my-plugin')
    scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind'],
      features: ['bridge'],
      target,
    })
    const claude = readFileSync(join(target, 'CLAUDE.md'), 'utf-8')
    expect(claude).toContain('# MyPlugin — Engineering-Regeln')
    expect(claude).toContain('"my-plugin-cc"')
  })

  it('throws bei target-exists default', () => {
    const target = join(tmpDir, 'foo')
    scaffold({ pluginName: 'foo', hosts: ['teammind'], features: ['bridge'], target })
    expect(() =>
      scaffold({ pluginName: 'foo', hosts: ['teammind'], features: ['bridge'], target }),
    ).toThrow(ScaffoldError)
  })

  it('--force overrides target-exists', () => {
    const target = join(tmpDir, 'foo')
    scaffold({ pluginName: 'foo', hosts: ['teammind'], features: ['bridge'], target })
    expect(() =>
      scaffold({
        pluginName: 'foo',
        hosts: ['teammind'],
        features: ['bridge'],
        target,
        force: true,
      }),
    ).not.toThrow()
  })

  it('skipt feature-files wenn feature nicht in features-list', () => {
    const target = join(tmpDir, 'my-plugin')
    scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind'],
      features: [], // no bridge feature → bridge-package files skipped
      target,
    })
    expect(existsSync(join(target, 'package.json'))).toBe(true) // root file
    expect(existsSync(join(target, 'packages/my-plugin-bridge/package.json'))).toBe(false)
  })

  it('returns filesWritten list', () => {
    const target = join(tmpDir, 'my-plugin')
    const r = scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind'],
      features: ['bridge'],
      target,
    })
    expect(r.filesWritten.length).toBeGreaterThan(5)
    expect(r.filesWritten).toContain('package.json')
  })

  it('returns context für caller-summary', () => {
    const target = join(tmpDir, 'my-plugin')
    const r = scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind', 'theseus'],
      features: ['bridge', 'mcp'],
      target,
    })
    expect(r.context.pluginName).toBe('my-plugin')
    expect(r.context.pluginNamePascal).toBe('MyPlugin')
    expect(r.context.hosts).toEqual(['teammind', 'theseus'])
  })
})

// ── withPublicHealth wird mitgeliefert ───────────────────────────────────────
// Der Wrapper ist die einzige heute verfuegbare Antwort auf die
// Health-hinter-auth-Generation (foundation 0.12.0–0.18.x): 0.19.0 behebt es an
// der Quelle, liegt aber nicht auf npm. DREI Plugins haben ihn unabhaengig
// voneinander nachgebaut, bevor er hier lag — das ist der Grund, dass er hier
// liegt.
describe('scaffold — withPublicHealth', () => {
  it('liefert src/public-health.mjs mit', () => {
    const target = join(tmpDir, 'health-probe')
    scaffold({ pluginName: 'health-probe', hosts: ['theseus'], features: ['bridge'], target })
    expect(existsSync(join(target, 'src/public-health.mjs'))).toBe(true)
  })

  it('trennt Health von Auth — und die Gegenprobe ist der wichtigere Teil', async () => {
    const target = join(tmpDir, 'health-probe2')
    scaffold({ pluginName: 'health-probe2', hosts: ['theseus'], features: ['bridge'], target })

    const mod = (await import(
      pathToFileURL(join(target, 'src/public-health.mjs')).href
    )) as {
      withPublicHealth: (
        inner: (r: Request) => Promise<Response>,
        m?: { version?: string },
      ) => (r: Request) => Promise<Response>
    }

    // Steht fuer foundation 0.12–0.18: alles 401, auch /health.
    const inner = async () =>
      new Response(JSON.stringify({ error: { code: 'invalid_token' } }), { status: 401 })
    const f = mod.withPublicHealth(inner, { version: '1.2.3' })
    const code = async (method: string, path: string) =>
      (await f(new Request(`http://x${path}`, { method }))).status

    // Health wird frei …
    expect(await code('GET', '/plugin-bridge/v1/health')).toBe(200)
    expect(await code('HEAD', '/plugin-bridge/v1/health')).toBe(200)
    expect(await code('GET', '/plugin-bridge/v1/health?verbose=1')).toBe(200)

    // … und alles andere bleibt geschuetzt. Eine Reparatur, die zu viel
    // oeffnet, waere schlimmer als der Fehler.
    expect(await code('POST', '/plugin-bridge/v1/execute-tool')).toBe(401)
    expect(await code('GET', '/plugin-bridge/v1/manifest')).toBe(401)
    expect(await code('POST', '/plugin-bridge/v1/handshake')).toBe(401)
    expect(await code('POST', '/plugin-bridge/v1/health')).toBe(401)
    expect(await code('GET', '/plugin-bridge/v1/health/deep')).toBe(401)
  })
})

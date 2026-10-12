import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { scaffold } from '../src/scaffolders/scaffold.js'
import { parseArgs } from '../src/args.js'
import { buildTestRegistry } from '../../../packages/plugin-bridge-foundation/src/testing/index.js'
import {
  createMcpUiResourceClient,
  MCP_UI_MIME_TYPE,
} from '../../../packages/plugin-bridge-foundation/src/index.js'
import type { Hono } from 'hono'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const TENANT = '00000000-0000-4000-8000-000000000001'
const USER = '00000000-0000-4000-8000-000000000002'
const URI = 'ui://ui-plugin/item-panel'
let target: string

function packageRoot(name: string) {
  let current = dirname(require.resolve(name))
  while (current !== dirname(current)) {
    try {
      if (JSON.parse(readFileSync(join(current, 'package.json'), 'utf8')).name === name)
        return current
    } catch {
      /* ascend */
    }
    current = dirname(current)
  }
  throw new Error(`package root not found: ${name}`)
}

beforeEach(() => {
  target = mkdtempSync(join(tmpdir(), 'generated-mcp-ui-'))
  const args = parseArgs([
    'node',
    'create-plugin',
    'ui-plugin',
    '--features=mcp-ui',
    `--target=${target}`,
  ])
  // Exercise the public scaffolder directly too: it must imply bridge itself.
  expect(args.features).toContain('bridge')
  scaffold({ ...args, features: ['mcp-ui'], force: true })
  for (const [name, source] of [
    ['@nexus-mindgarden/plugin-bridge-foundation', join(ROOT, 'packages/plugin-bridge-foundation')],
    ['hono', join(ROOT, 'packages/plugin-bridge-foundation/node_modules/hono')],
    ['@types', join(ROOT, 'node_modules/@types')],
    ...[
      '@modelcontextprotocol/ext-apps',
      '@modelcontextprotocol/client',
      '@modelcontextprotocol/core',
      'zod',
      'esbuild',
      'typescript',
    ].map((name) => [name, packageRoot(name)]),
  ]) {
    const destination = join(target, 'node_modules', name!)
    mkdirSync(dirname(destination), { recursive: true })
    symlinkSync(source!, destination, process.platform === 'win32' ? 'junction' : 'dir')
  }
})

afterEach(() => rmSync(target, { recursive: true, force: true }))

async function fixture() {
  for (const name of ['bridge', 'mcp-ui']) {
    const result = spawnSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '-p', `packages/ui-plugin-${name}/tsconfig.json`],
      { cwd: target, encoding: 'utf8', timeout: 20_000 },
    )
    expect(result.status, result.stdout + result.stderr).toBe(0)
  }
  const result = spawnSync(process.execPath, ['packages/ui-plugin-mcp-ui/build.mjs'], {
    cwd: target,
    encoding: 'utf8',
    timeout: 20_000,
  })
  expect(result.status, result.stdout + result.stderr).toBe(0)
  const module = (await import(
    /* @vite-ignore */ pathToFileURL(join(target, 'packages/ui-plugin-bridge/dist/index.js')).href
  )) as {
    createApp(dir: string): Promise<Hono>
  }
  const app = await module.createApp(target)
  const host = await buildTestRegistry({ hostId: 'theseus' })
  expect(
    (
      await app.request('/plugin-bridge/v1/register-host', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host_id: 'theseus', public_key_pem: host.publicKeyPem }),
      })
    ).status,
  ).toBe(200)
  const token = await host.mintToken({
    pluginId: 'ui-plugin',
    tenantId: TENANT,
    userId: USER,
    sub: USER,
    aud: 'ui-plugin',
  })
  const client = createMcpUiResourceClient({
    bridgeEndpoint: 'http://127.0.0.1:3600',
    tokenResolver: () => token,
    fetch: async (input, init) => app.request(String(input), init),
  })
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await app.request('/plugin-bridge/v1/execute-tool', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tool_name: name, arguments: args, tenant_id: TENANT, user_id: USER }),
    })
    const value = (await response.json()) as { ok: boolean; result: unknown }
    if (!value.ok) throw new Error('tool denied')
    return value.result
  }
  return { app, token, client, call }
}

describe('generated MCP UI plugin', () => {
  it('builds the real SDK widget and serves its declared URI with a structured tool result', async () => {
    const f = await fixture()
    const resource = (await f.client.list()).resources[0]!
    expect(resource).toMatchObject({
      uri: URI,
      mimeType: MCP_UI_MIME_TYPE,
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
    })
    const html = (await f.client.read(URI)).contents[0]!.text
    expect(Buffer.byteLength(html)).toBeLessThanOrEqual(512 * 1024)
    expect(html).toContain('<script>')
    expect(html).not.toContain('MCP_APP_SCRIPT')
    expect(html).not.toContain(f.token)
    expect(html).not.toMatch(/<script[^>]+src=/)
    expect(html).not.toMatch(/<link[^>]+href=/)
    expect(await f.call('items.panel', {})).toMatchObject({
      content: [{ type: 'text' }],
      structuredContent: { items: [] },
    })
    expect(
      (
        await f.app.request('/plugin-bridge/v1/resources/read', {
          method: 'POST',
          body: JSON.stringify({ uri: URI }),
        })
      ).status,
    ).toBe(401)
  }, 30_000)

  // Reproducible release smoke: MCP_UI_BROWSER=1 with a Playwright Chromium
  // install (or MCP_UI_BROWSER_EXECUTABLE). Native goMind remains a separate gate.
  it.runIf(process.env.MCP_UI_BROWSER === '1')(
    'initializes in an opaque iframe, receives data and calls the provider through the official SDK',
    async () => {
      const f = await fixture()
      const calls: string[] = []
      const hostEntry = `import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
      const frame = document.querySelector('iframe');
      const bridge = new AppBridge(null, {name:'TemplateSmoke',version:'1.0.0'}, {serverTools:{}});
      bridge.oncalltool = async ({name, arguments: args}) => {
        const response = await fetch('/call', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,args})});
        if (!response.ok) throw new Error('denied');
        return response.json();
      };
      bridge.oninitialized = async () => {
        await bridge.sendToolInput({arguments:{}});
        await bridge.sendToolResult({content:[{type:'text',text:'Initial item'}],structuredContent:{items:[{id:'host-initial'}]}});
        document.body.dataset.ready = 'yes';
      };
      await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
      const resource = await (await fetch('/resource')).json();
      const doc = new DOMParser().parseFromString(resource.contents[0].text, 'text/html');
      const policy = doc.createElement('meta');
      policy.httpEquiv = 'Content-Security-Policy';
      policy.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'";
      doc.head.prepend(policy);
      frame.srcdoc = doc.documentElement.outerHTML;`
      const hostBundle = await build({
        stdin: {
          contents: hostEntry,
          resolveDir: dirname(packageRoot('@modelcontextprotocol/ext-apps')) + '/..',
        },
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        minify: true,
      })
      const hostHtml = `<html><body style="margin:0"><iframe title="Widget" sandbox="allow-scripts" style="width:100%;height:450px;border:0"></iframe><script type="module">${hostBundle.outputFiles[0]!.text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
      const server = createServer(async (request, response) => {
        try {
          if (request.url === '/') {
            response.setHeader('content-type', 'text/html')
            response.end(hostHtml)
            return
          }
          response.setHeader('content-type', 'application/json')
          if (request.url === '/resource') {
            response.end(JSON.stringify(await f.client.read(URI)))
            return
          }
          if (request.url === '/call') {
            let body = ''
            for await (const chunk of request) body += String(chunk)
            const input = JSON.parse(body) as { name: string; args: Record<string, unknown> }
            if (input.name !== 'items.panel') {
              response.statusCode = 403
              response.end('{}')
              return
            }
            calls.push(input.name)
            response.end(JSON.stringify(await f.call(input.name, input.args)))
            return
          }
          response.statusCode = 404
          response.end('{}')
        } catch {
          response.statusCode = 500
          response.end('{}')
        }
      })
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address() as { port: number }
      let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
      try {
        browser = await chromium.launch({
          headless: true,
          ...(process.env.MCP_UI_BROWSER_EXECUTABLE
            ? { executablePath: process.env.MCP_UI_BROWSER_EXECUTABLE }
            : {}),
        })
        const page = await browser.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.goto(`http://127.0.0.1:${address.port}`)
        await page.locator('body[data-ready=yes]').waitFor()
        const widget = page.frameLocator('iframe')
        await expect.poll(() => widget.locator('#items').textContent()).toContain('host-initial')
        await widget.getByRole('button', { name: 'Aktualisieren' }).click()
        await expect.poll(() => widget.locator('#items').textContent()).toBe('[]')
        expect(calls).toEqual(['items.panel'])
        const frame = page.frames()[1]!
        expect(
          await frame.evaluate(() => {
            try {
              void window.parent.document
              return false
            } catch {
              return true
            }
          }),
        ).toBe(true)
        for (const width of [320, 360, 390, 430]) {
          await page.setViewportSize({ width, height: 700 })
          expect(
            await frame.evaluate(
              () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            ),
          ).toBe(true)
        }
        expect(errors).toEqual([])
      } finally {
        await browser?.close()
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
      }
    },
    60_000,
  )
})

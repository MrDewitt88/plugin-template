import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { expect, it } from 'vitest'
import { buildTestRegistry } from '../../../packages/plugin-bridge-foundation/src/testing/index.js'

// Explicit consumer smoke: generate/install/build an app before running this.
// STANDALONE_APP_SMOKE=1 STANDALONE_APP_DIR=/absolute/path/to/generated-app
it.runIf(process.env.STANDALONE_APP_SMOKE === '1')(
  'pairs the standalone app and routes an opaque SDK widget into its persistent domain',
  async () => {
    const directory = resolve(process.env.STANDALONE_APP_DIR ?? 'examples/standalone-notes-app')
    const { createStandaloneApplication } = await import(
      /* @vite-ignore */ pathToFileURL(resolve(directory, 'dist/application.js')).href
    )
    const dataDirectory = await mkdtemp(resolve(tmpdir(), 'standalone-browser-'))
    let runtime: Awaited<ReturnType<typeof createStandaloneApplication>>
    let token = ''
    const host = await buildTestRegistry({ hostId: 'theseus' })
    const identity = {
      tenantId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
    }
    const calls: string[] = []
    const kernel = pathToFileURL(
      resolve(import.meta.dirname, '../../../packages/mcpi-host/dist/browser.js'),
    ).pathname
    const bundle = await build({
      stdin: {
        contents: `import {mountAppFrame} from ${JSON.stringify(kernel)};
    window.closeWidget=await mountAppFrame(document.querySelector('iframe'),{
      html:await (await fetch('/resource')).text(),isCurrent:()=>true,
      callTool:async(name,args)=>{const response=await fetch('/call',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,args})});if(!response.ok)throw new Error('denied');return response.json();},
      onReady:()=>{document.body.dataset.ready='yes'}
    });`,
        resolveDir: import.meta.dirname,
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      minify: true,
    })
    const hostHtml = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe title="MCPi Widget" sandbox="allow-scripts" style="width:100%;height:500px;border:0"></iframe><script type="module">${bundle.outputFiles[0]!.text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
    const server = createServer(async (request, response) => {
      try {
        const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port
        if (request.url === '/host') {
          response.setHeader('content-type', 'text/html')
          response.end(hostHtml)
          return
        }
        if (request.url === '/resource') {
          const resource = await runtime.bridge.request('/plugin-bridge/v1/resources/read', {
            method: 'POST',
            headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
            body: JSON.stringify({ uri: `ui://${runtime.manifest.id}/item-panel` }),
          })
          expect(resource.status).toBe(200)
          const html = (await resource.json()).contents[0].text
          expect(html).not.toContain(token)
          response.setHeader('content-type', 'text/html')
          response.end(html)
          return
        }
        let body = ''
        for await (const chunk of request) body += chunk.toString()
        if (request.url === '/call') {
          const { name, args } = JSON.parse(body)
          if (!['items.panel', 'items.list', 'items.create'].includes(name))
            throw new Error('wrong_provider_tool')
          calls.push(name)
          const result = await runtime.bridge.request('/plugin-bridge/v1/execute-tool', {
            method: 'POST',
            headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
            body: JSON.stringify({
              tool_name: name,
              arguments: args,
              tenant_id: identity.tenantId,
              user_id: identity.userId,
            }),
          })
          const value = await result.json()
          if (!value.ok) throw new Error('call_denied')
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify(value.result))
          return
        }
        const headers = new Headers()
        for (const [key, value] of Object.entries(request.headers))
          if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
        const main = await runtime.app.request(origin + request.url, {
          method: request.method ?? 'GET',
          headers,
          ...(body ? { body } : {}),
        })
        response.writeHead(main.status, Object.fromEntries(main.headers))
        response.end(Buffer.from(await main.arrayBuffer()))
      } catch {
        response.statusCode = 500
        response.end('fixture_failed')
      }
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    try {
      runtime = await createStandaloneApplication({
        rootDirectory: directory,
        dataDirectory,
        appOrigin: origin,
        bridgeEndpoint: 'http://127.0.0.1:3670',
        localIdentity: identity,
      })
      await runtime.registry.register({
        host_id: 'theseus',
        public_key_pem: host.publicKeyPem,
        expected_issuer: 'theseus-instance',
      })
      browser = await chromium.launch({
        headless: true,
        ...(process.env.MCP_UI_BROWSER_EXECUTABLE
          ? { executablePath: process.env.MCP_UI_BROWSER_EXECUTABLE }
          : {}),
      })
      const page = await browser.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(runtime.launchUrl)
      await expect.poll(() => page.locator('article').textContent()).toContain('pending')
      await page.getByRole('button', { name: 'Geprüften Schlüssel freigeben' }).click()
      await expect.poll(() => page.locator('article').textContent()).toContain('active')
      await page.getByLabel('Neuer Eintrag').fill('From primary app')
      await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
      await expect.poll(() => page.locator('ul').textContent()).toContain('From primary app')
      token = await host.mintToken({
        pluginId: runtime.manifest.id,
        tenantId: identity.tenantId,
        userId: identity.userId,
        sub: identity.userId,
        aud: runtime.manifest.id,
        iss: 'theseus-instance',
        scopes: ['mcp.read.' + runtime.manifest.id, 'mcp.write.' + runtime.manifest.id + '.items'],
      })
      const widgetPage = await browser.newPage()
      widgetPage.on('pageerror', (error) => errors.push(error.message))
      await widgetPage.goto(origin + '/host')
      await widgetPage.locator('body[data-ready=yes]').waitFor()
      const widget = widgetPage.frameLocator('iframe')
      await widget.getByRole('button', { name: 'Aktualisieren' }).click()
      await expect.poll(() => widget.locator('#items').textContent()).toContain('From primary app')
      await widget.getByLabel('Neuer Eintrag').fill('<img src=x onerror=alert(1)> from widget')
      await widget.getByRole('button', { name: 'Anlegen' }).click()
      await expect
        .poll(() => widget.locator('#items').textContent(), { timeout: 5000 })
        .toContain('from widget')
      expect(await widget.locator('img').count()).toBe(0)
      await page.getByRole('button', { name: 'Aktualisieren', exact: true }).click()
      await expect.poll(() => page.locator('ul').textContent()).toContain('from widget')
      const frame = widgetPage.frames()[1]!
      expect(
        await frame.evaluate(() => {
          try {
            void parent.document
            return false
          } catch {
            return true
          }
        }),
      ).toBe(true)
      for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 760 })
        await widgetPage.setViewportSize({ width, height: 760 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        expect(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
      }
      await widgetPage.close()
      await page.getByLabel('Neuer Eintrag').fill('App still works after host closes')
      await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
      await expect.poll(() => page.locator('ul').textContent()).toContain('App still works')
      expect(calls).toEqual(['items.panel', 'items.create', 'items.panel'])
      expect(errors).toEqual([])
    } finally {
      await browser?.close()
      await new Promise<void>((done) => server.close(() => done()))
      await rm(dataDirectory, { recursive: true, force: true })
    }
  },
  60_000,
)

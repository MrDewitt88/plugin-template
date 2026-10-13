import { describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { buildAppDocument } from '../dist/document.js'

describe('official MCP Apps host roundtrip', () => {
  it.runIf(process.env.MCP_UI_BROWSER === '1')(
    'initializes, receives input/result, mediates callbacks and isolates the app on smartphone widths',
    async () => {
      const { chromium } = await import('playwright')
      const widget = await build({
        stdin: {
          resolveDir: new URL('../', import.meta.url).pathname,
          contents: `import {App} from '@modelcontextprotocol/ext-apps/app-with-deps';
        const app = new App({name:'Fixture',version:'1.0.0'},{});
        const output = document.querySelector('output');
        app.ontoolinput = () => document.body.dataset.input = 'yes';
        app.ontoolresult = value => output.textContent = value.structuredContent.message;
        try { parent.document.body; document.body.dataset.isolated='no'; } catch { document.body.dataset.isolated='yes'; }
        document.querySelector('button').onclick = async () => {
          const result = await app.callServerTool({name:'items.panel',arguments:{text:'from app'}});
          output.textContent = result.structuredContent.message;
        };
        app.connect();`,
        },
        bundle: true,
        write: false,
        minify: true,
        platform: 'browser',
        format: 'iife',
      })
      const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;box-sizing:border-box}button{min-height:44px;max-width:100%}</style></head><body><output></output><button>Refresh</button><script>${widget.outputFiles[0]!.text}</script></body></html>`
      const document = buildAppDocument({
        html,
        initialInput: {},
        initialResult: {
          content: [{ type: 'text', text: 'initial' }],
          structuredContent: { message: 'initial' },
        },
      })
      const browser = await chromium.launch({
        ...(process.env.MCP_UI_BROWSER_EXECUTABLE
          ? { executablePath: process.env.MCP_UI_BROWSER_EXECUTABLE }
          : {}),
        headless: true,
      })
      try {
        const context = await browser.newContext()
        // iOS 16 lacks these static methods in both the host and widget realms.
        await context.addInitScript(() => {
          Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true })
          Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true })
        })
        const page = await context.newPage()
        await page.evaluate(() => {
          const target = window as unknown as {
            TheseusMcpHost: unknown
            TheseusMcpApp: { handleResult(raw: unknown): void }
            requests: unknown[]
          }
          target.requests = []
          target.TheseusMcpHost = {
            postMessage(message: { id: string; name: string; args: unknown }) {
              target.requests.push(message)
              target.TheseusMcpApp.handleResult({
                type: 'theseus.mcp-app/v1',
                kind: 'result',
                id: message.id,
                ok: true,
                value: JSON.stringify({
                  content: [{ type: 'text', text: 'updated' }],
                  structuredContent: { message: 'updated' },
                }),
              })
            },
          }
        })
        await page.setContent(document)
        const frame = page.frameLocator('#app')
        await frame.locator('output').getByText('initial', { exact: true }).waitFor()
        expect(await frame.locator('body').getAttribute('data-input')).toBe('yes')
        expect(await frame.locator('body').getAttribute('data-isolated')).toBe('yes')
        expect(await page.locator('#app').getAttribute('sandbox')).toBe('allow-scripts')
        for (const width of [320, 360, 390, 430]) {
          await page.setViewportSize({ width, height: 800 })
          expect(
            await frame.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth),
          ).toBe(true)
          expect((await frame.locator('button').boundingBox())!.height).toBeGreaterThanOrEqual(44)
        }
        await frame.getByRole('button', { name: 'Refresh' }).click()
        await frame.locator('output').getByText('updated', { exact: true }).waitFor()
        expect(
          await page.evaluate(
            () => (window as unknown as { requests: { name: string; args: unknown }[] }).requests,
          ),
        ).toMatchObject([{ name: 'items.panel', args: { text: 'from app' } }])
        // A window other than the mounted opaque app cannot request tools.
        await page.evaluate(() =>
          window.postMessage(
            {
              jsonrpc: '2.0',
              id: 99,
              method: 'tools/call',
              params: { name: 'foreign', arguments: {} },
            },
            '*',
          ),
        )
        expect(
          await page.evaluate(() => (window as unknown as { requests: unknown[] }).requests.length),
        ).toBe(1)
      } finally {
        await browser.close()
      }
    },
    30000,
  )
})

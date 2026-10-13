import { shellScript } from './shell-script.js'
import type { AppToolResult } from './client.js'

export interface AppDocumentOptions {
  readonly html: string
  readonly initialInput?: Record<string, unknown>
  readonly initialResult?: AppToolResult
}
/** Parent shell contains no credentials. The resource lives only in an opaque iframe. */
export function buildAppDocument(options: AppDocumentOptions): string {
  const json = JSON.stringify(options).replaceAll('<', '\\u003c').replaceAll('&', '\\u0026')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src about: data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style></head><body><iframe id="app" title="MCP App" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><script id="payload" type="application/json">${json}</script><script>${shellScript.replaceAll('</script', '<\\/script')}</script></body></html>`
}

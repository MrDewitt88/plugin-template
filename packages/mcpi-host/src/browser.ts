import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { CallToolResultSchema } from '@modelcontextprotocol/core'
import { MAX_HTML_BYTES, isRecord, parseAppToolResult, type AppToolResult } from './client.js'
import { installAbortCompatibility } from './compat.js'

export const APP_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"
export interface MountAppOptions {
  readonly html: string
  readonly callTool: (
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<AppToolResult>
  readonly isCurrent: () => boolean
  readonly initialInput?: Record<string, unknown>
  readonly initialResult?: AppToolResult
  readonly onReady?: () => void
  readonly onError?: () => void
}
/** Official MCP Apps bridge. Only serverTools is granted, never host/native APIs. */
export async function mountAppFrame(
  frame: HTMLIFrameElement,
  options: MountAppOptions,
): Promise<() => void> {
  installAbortCompatibility()
  if (!options.html || new TextEncoder().encode(options.html).length > MAX_HTML_BYTES)
    throw new Error('mcpi_resource_invalid')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.setAttribute(
    'allow',
    "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-write 'none'",
  )
  frame.removeAttribute('src')
  const parser = new DOMParser()
  const document = parser.parseFromString(options.html, 'text/html')
  const policy = document.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = APP_CSP
  document.head.prepend(policy)
  const compatibility = document.createElement('script')
  compatibility.textContent = `(${installAbortCompatibility.toString()})();`
  policy.after(compatibility)
  const bridge = new AppBridge(
    null,
    { name: 'Mind MCPi Host', version: '1.0.0' },
    { serverTools: {} },
  )
  let closed = false
  let ready = false
  const controller = new AbortController()
  const current = (): boolean => !closed && options.isCurrent()
  bridge.oncalltool = async ({ name, arguments: args }, extra) => {
    if (
      !ready ||
      !current() ||
      !isRecord(args ?? {}) ||
      new TextEncoder().encode(JSON.stringify(args ?? {})).length > 65536
    )
      throw new Error('mcpi_denied')
    const request = new AbortController()
    const forward = (): void => request.abort()
    const parents = [controller.signal, extra.mcpReq.signal]
    for (const signal of parents) {
      if (signal.aborted) forward()
      else signal.addEventListener('abort', forward, { once: true })
    }
    let result: AppToolResult
    try {
      if (request.signal.aborted) throw new Error('mcpi_denied')
      result = await options.callTool(name, (args ?? {}) as Record<string, unknown>, request.signal)
      if (request.signal.aborted) throw new Error('mcpi_denied')
    } finally { for (const signal of parents) signal.removeEventListener('abort', forward) }
    if (!current()) throw new Error('mcpi_owner_stale')
    // A large result never crosses the frame boundary, even with a lax host adapter.
    if (new TextEncoder().encode(JSON.stringify(result)).length > 1024 * 1024)
      throw new Error('mcpi_result_oversize')
    return CallToolResultSchema.parse(parseAppToolResult(result))
  }
  bridge.oninitialized = () => {
    if (!current()) return
    ready = true
    void (async () => {
      await bridge.sendToolInput({ arguments: options.initialInput ?? {} })
      if (!current()) return
      if (options.initialResult)
        await bridge.sendToolResult(CallToolResultSchema.parse(options.initialResult))
      if (current()) options.onReady?.()
    })().catch(() => {
      if (current()) options.onError?.()
    })
  }
  bridge.onerror = () => {
    if (current()) options.onError?.()
  }
  if (!frame.contentWindow) throw new Error('mcpi_frame_unavailable')
  await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow))
  if (!current()) {
    await bridge.close()
    throw new Error('mcpi_owner_stale')
  }
  frame.srcdoc = document.documentElement.outerHTML
  return () => {
    if (closed) return
    closed = true
    controller.abort()
    frame.srcdoc = ''
    void bridge.close()
  }
}

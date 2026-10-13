import { mountAppFrame } from './browser.js'
import { isRecord, parseAppToolResult, type AppToolResult } from './client.js'

declare global {
  interface Window {
    TheseusMcpHost?: { postMessage(message: unknown): void }
    TheseusMcpApp?: { handleResult(message: unknown): boolean }
  }
}
const TYPE = 'theseus.mcp-app/v1'
const pending = new Map<
  string,
  { resolve(value: AppToolResult): void; reject(): void; timer: ReturnType<typeof setTimeout> }
>()
let next = 0
let live = true
window.TheseusMcpApp = Object.freeze({
  handleResult(message: unknown): boolean {
    if (
      !isRecord(message) ||
      message.type !== TYPE ||
      message.kind !== 'result' ||
      typeof message.id !== 'string'
    )
      return false
    const request = pending.get(message.id)
    if (!request) return false
    pending.delete(message.id)
    clearTimeout(request.timer)
    try {
      if (message.ok !== true || typeof message.value !== 'string') throw new Error()
      let result: unknown
      try {
        result = JSON.parse(message.value) as unknown
      } catch {
        result = { content: [{ type: 'text', text: message.value }] }
      }
      // Legacy stdio executors return text. Modern plugin callbacks retain MCP content.
      if (!isRecord(result) || !Array.isArray(result.content))
        result = { content: [{ type: 'text', text: message.value }] }
      request.resolve(parseAppToolResult(result))
    } catch {
      request.reject()
    }
    return true
  },
})
const payload = document.querySelector('#payload')?.textContent
const frame = document.querySelector<HTMLIFrameElement>('#app')
if (payload && frame) {
  const input = JSON.parse(payload) as {
    html: string
    initialInput?: Record<string, unknown>
    initialResult?: AppToolResult
  }
  void mountAppFrame(frame, {
    ...input,
    isCurrent: () => live,
    callTool: async (name, args) =>
      new Promise((resolve, reject) => {
        if (pending.size >= 8 || !window.TheseusMcpHost) {
          reject(new Error('mcpi_unavailable'))
          return
        }
        const id = `app-${++next}`
        const fail = (): void => reject(new Error('mcpi_denied'))
        const timer = setTimeout(() => {
          pending.delete(id)
          fail()
        }, 30000)
        pending.set(id, { resolve, reject: fail, timer })
        try {
          window.TheseusMcpHost.postMessage({ type: TYPE, kind: 'action', id, name, args })
        } catch {
          pending.delete(id)
          clearTimeout(timer)
          fail()
        }
      }),
  }).catch(() => {})
}
window.addEventListener('pagehide', () => {
  live = false
  for (const request of pending.values()) {
    clearTimeout(request.timer)
    request.reject()
  }
  pending.clear()
})

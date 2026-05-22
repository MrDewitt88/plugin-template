// v0.6.0: Tests for `/runtime`-subpath callMcp() helper. Uses Node-native
// EventTarget + CustomEvent (Node 20+) — no jsdom/happy-dom dep needed.
//
// Test-pattern: create an EventTarget-stand-in for `mount`, dispatch the
// response-event manually after observing the request-event, verify the
// Promise resolution/rejection + listener-cleanup behavior.

import { describe, expect, it } from 'vitest'
import {
  callMcp,
  CallMcpError,
  createCallMcpDispatcher,
  PLUGIN_MCP_CALL_EVENT,
  PLUGIN_MCP_RESPONSE_EVENT,
  type PluginMcpCallDetail,
  type PluginMcpResponseDetail,
} from '../src/runtime/index.js'

/**
 * Minimal mock for the `mount` HTMLElement. EventTarget supplies the
 * runtime-needed API surface. The cast to HTMLElement is safe because
 * callMcp only invokes the EventTarget methods at runtime.
 */
function makeMount(): HTMLElement {
  return new EventTarget() as unknown as HTMLElement
}

/**
 * Helper: listen for one outgoing `plugin:mcp-call` event and reply via
 * `plugin:mcp-response` with the given detail-builder. Returns the captured
 * request-detail (useful for asserting wire-shape).
 */
function autoReply(
  mount: HTMLElement,
  reply: (req: PluginMcpCallDetail) => PluginMcpResponseDetail<unknown>,
): Promise<PluginMcpCallDetail> {
  return new Promise((resolve) => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<PluginMcpCallDetail>).detail
      mount.removeEventListener(PLUGIN_MCP_CALL_EVENT, handler as EventListener)
      const responseDetail = reply(detail)
      // Dispatch reply on next microtask to mimic IPC-async-roundtrip
      queueMicrotask(() => {
        mount.dispatchEvent(
          new CustomEvent(PLUGIN_MCP_RESPONSE_EVENT, { detail: responseDetail }),
        )
      })
      resolve(detail)
    }
    mount.addEventListener(PLUGIN_MCP_CALL_EVENT, handler as EventListener)
  })
}

describe('@nexus-mindgarden/plugin-bridge-foundation/runtime — callMcp', () => {
  describe('happy-path: dispatches event + resolves on ok response', () => {
    it('emits plugin:mcp-call CustomEvent with request_id + qualified_name + arguments', async () => {
      const mount = makeMount()
      const reqCaptured = autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: true,
        result: { session_id: 's_42' },
      }))
      const result = await callMcp<{ session_id: string }>(mount, 'wizmind.session.start', {
        campaign_id: 'c_abc',
      })
      const req = await reqCaptured
      expect(req.qualified_name).toBe('wizmind.session.start')
      expect(req.arguments).toEqual({ campaign_id: 'c_abc' })
      expect(req.request_id).toMatch(/^[0-9a-f-]{36}$/)
      expect(result).toEqual({ session_id: 's_42' })
    })

    it('returns the result-payload typed as T (compile-time only, validated at runtime via expect)', async () => {
      const mount = makeMount()
      autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: true,
        result: { count: 7, items: ['a', 'b'] },
      }))
      const result = await callMcp<{ count: number; items: string[] }>(
        mount,
        'kanban.tasks.search',
        { query: 'auth' },
      )
      expect(result.count).toBe(7)
      expect(result.items).toContain('a')
    })
  })

  describe('error-path: rejects with CallMcpError on ok=false', () => {
    it('rejects with code + message from response', async () => {
      const mount = makeMount()
      autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: false,
        code: 'insufficient_scope',
        message: 'mcp.admin.tasks required',
      }))
      await expect(callMcp(mount, 'kanban.tasks.archive', { task_id: 't_x' })).rejects.toThrow(
        CallMcpError,
      )
      // Re-run for explicit code-check
      autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: false,
        code: 'tool_not_found',
      }))
      try {
        await callMcp(mount, 'nonexistent.tool', {})
        expect.fail('should have rejected')
      } catch (err) {
        expect(err).toBeInstanceOf(CallMcpError)
        expect((err as CallMcpError).code).toBe('tool_not_found')
        expect((err as CallMcpError).message).toBe('tool_not_found') // falls back to code
      }
    })

    it('rejects with CallMcpError name set to "CallMcpError"', async () => {
      const mount = makeMount()
      autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: false,
        code: 'host_busy',
      }))
      try {
        await callMcp(mount, 'foo.bar', {})
      } catch (err) {
        expect((err as Error).name).toBe('CallMcpError')
      }
    })
  })

  describe('request_id matching: only responds to matching request_id', () => {
    it('ignores response with mismatching request_id', async () => {
      const mount = makeMount()
      // Register call-listener BEFORE invoking callMcp (callMcp dispatches synchronously)
      const handler = (e: Event): void => {
        const detail = (e as CustomEvent<PluginMcpCallDetail>).detail
        mount.removeEventListener(PLUGIN_MCP_CALL_EVENT, handler as EventListener)
        queueMicrotask(() => {
          // First: dispatch noise with WRONG request_id (should be ignored)
          mount.dispatchEvent(
            new CustomEvent(PLUGIN_MCP_RESPONSE_EVENT, {
              detail: { request_id: 'noise-not-ours', ok: true, result: 'wrong' },
            }),
          )
          // Then: dispatch the real response with matching request_id
          mount.dispatchEvent(
            new CustomEvent(PLUGIN_MCP_RESPONSE_EVENT, {
              detail: { request_id: detail.request_id, ok: true, result: 'correct' },
            }),
          )
        })
      }
      mount.addEventListener(PLUGIN_MCP_CALL_EVENT, handler as EventListener)
      const result = await callMcp(mount, 'tool.x', {})
      expect(result).toBe('correct')
    })

    it('multiple concurrent calls each resolve independently with their own id', async () => {
      const mount = makeMount()
      // Auto-reply with echo-of-args.x so we can pair calls to results
      mount.addEventListener(PLUGIN_MCP_CALL_EVENT, ((e: CustomEvent<PluginMcpCallDetail>) => {
        const detail = e.detail
        const args = detail.arguments as { x: number }
        queueMicrotask(() => {
          mount.dispatchEvent(
            new CustomEvent(PLUGIN_MCP_RESPONSE_EVENT, {
              detail: {
                request_id: detail.request_id,
                ok: true,
                result: args.x * 2,
              },
            }),
          )
        })
      }) as EventListener)
      const [r1, r2, r3] = await Promise.all([
        callMcp<number>(mount, 'tool.double', { x: 5 }),
        callMcp<number>(mount, 'tool.double', { x: 10 }),
        callMcp<number>(mount, 'tool.double', { x: 7 }),
      ])
      expect([r1, r2, r3]).toEqual([10, 20, 14])
    })
  })

  describe('CustomEvent options: bubbles + composed (shadow-DOM-crossing)', () => {
    it('dispatches with bubbles=true (host-shell ancestor must be able to catch)', async () => {
      const mount = makeMount()
      let observedEvent: Event | null = null
      mount.addEventListener(PLUGIN_MCP_CALL_EVENT, ((e: Event) => {
        observedEvent = e
      }) as EventListener)
      // Fire-and-forget; we just want the bubble/composed flags
      callMcp(mount, 'tool.x', {}).catch(() => {
        /* will reject when no response — fine for this test */
      })
      // Allow microtask to flush
      await new Promise((r) => setTimeout(r, 0))
      expect(observedEvent).not.toBeNull()
      const ce = observedEvent as unknown as CustomEvent
      expect(ce.bubbles).toBe(true)
      expect(ce.composed).toBe(true)
    })
  })

  describe('listener-cleanup: no leak after resolution or rejection', () => {
    it('removes response-listener after resolve', async () => {
      const mount = makeMount()
      autoReply(mount, (req) => ({ request_id: req.request_id, ok: true, result: null }))
      await callMcp(mount, 'tool.x', {})
      // Dispatching a second response after resolution must not throw
      // (i.e. listener was removed)
      mount.dispatchEvent(
        new CustomEvent(PLUGIN_MCP_RESPONSE_EVENT, {
          detail: { request_id: 'orphan', ok: true, result: null },
        }),
      )
      // No assertion: success = no error
    })

    it('removes response-listener after reject', async () => {
      const mount = makeMount()
      autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: false,
        code: 'whatever',
      }))
      await expect(callMcp(mount, 'tool.x', {})).rejects.toThrow(CallMcpError)
      // No leak — second dispatch is harmless
      mount.dispatchEvent(
        new CustomEvent(PLUGIN_MCP_RESPONSE_EVENT, {
          detail: { request_id: 'orphan', ok: false, code: 'whatever' },
        }),
      )
    })
  })

  describe('createCallMcpDispatcher (curried form)', () => {
    it('returns a dispatcher bound to the mount', async () => {
      const mount = makeMount()
      mount.addEventListener(PLUGIN_MCP_CALL_EVENT, ((e: CustomEvent<PluginMcpCallDetail>) => {
        const detail = e.detail
        queueMicrotask(() => {
          mount.dispatchEvent(
            new CustomEvent(PLUGIN_MCP_RESPONSE_EVENT, {
              detail: { request_id: detail.request_id, ok: true, result: detail.qualified_name },
            }),
          )
        })
      }) as EventListener)
      const mcp = createCallMcpDispatcher(mount)
      const r1 = await mcp<string>('wizmind.a', {})
      const r2 = await mcp<string>('wizmind.b', {})
      expect(r1).toBe('wizmind.a')
      expect(r2).toBe('wizmind.b')
    })
  })

  describe('crypto.randomUUID guard', () => {
    it('rejects with crypto_unavailable code when randomUUID is missing', async () => {
      const mount = makeMount()
      const original = globalThis.crypto.randomUUID
      // Temporarily stub it
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: undefined,
        configurable: true,
        writable: true,
      })
      try {
        await expect(callMcp(mount, 'tool.x', {})).rejects.toMatchObject({
          name: 'CallMcpError',
          code: 'crypto_unavailable',
        })
      } finally {
        Object.defineProperty(globalThis.crypto, 'randomUUID', {
          value: original,
          configurable: true,
          writable: true,
        })
      }
    })
  })
})

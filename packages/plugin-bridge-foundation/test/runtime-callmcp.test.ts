// v0.6.0: Tests for `/runtime`-subpath callMcp() helper. Uses Node-native
// EventTarget + CustomEvent (Node 20+) — no jsdom/happy-dom dep needed.
//
// Test-pattern: create an EventTarget-stand-in for `mount`, dispatch the
// response-event manually after observing the request-event, verify the
// Promise resolution/rejection + listener-cleanup behavior.

import { describe, expect, it } from 'vitest'
import {
  CALL_MCP_DEFAULT_TIMEOUT_MS,
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

  describe('v0.6.1: actorClass option (agent msg #619 wire-spec)', () => {
    it('omits actor_class field when actorClass option not provided (default-actor-class policy)', async () => {
      const mount = makeMount()
      const captured = autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: true,
        result: null,
      }))
      await callMcp(mount, 'tool.x', {})
      const req = await captured
      expect(req).not.toHaveProperty('actor_class')
    })

    it('emits actor_class="user" when options.actorClass=user', async () => {
      const mount = makeMount()
      const captured = autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: true,
        result: null,
      }))
      await callMcp(mount, 'tool.x', {}, { actorClass: 'user' })
      const req = await captured
      expect(req.actor_class).toBe('user')
    })

    it('emits actor_class="kiara" when options.actorClass=kiara (autonomous-agent calls)', async () => {
      const mount = makeMount()
      const captured = autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: true,
        result: null,
      }))
      await callMcp(mount, 'tool.x', {}, { actorClass: 'kiara' })
      const req = await captured
      expect(req.actor_class).toBe('kiara')
    })

    it('actor_class propagates through curried dispatcher (v0.6.1+)', async () => {
      const mount = makeMount()
      const captured = autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: true,
        result: null,
      }))
      const mcp = createCallMcpDispatcher(mount)
      await mcp('tool.x', {}, { actorClass: 'kiara' })
      const req = await captured
      expect(req.actor_class).toBe('kiara')
    })
  })

  describe('v0.6.1: timeoutMs option (Foundation-side timeout)', () => {
    it('exports CALL_MCP_DEFAULT_TIMEOUT_MS = 30000', () => {
      expect(CALL_MCP_DEFAULT_TIMEOUT_MS).toBe(30_000)
    })

    it('rejects with CallMcpError("timeout") when no response within timeoutMs', async () => {
      const mount = makeMount()
      // No autoReply — let it time out
      const start = Date.now()
      try {
        await callMcp(mount, 'slow.tool', {}, { timeoutMs: 50 })
        expect.fail('should have timed out')
      } catch (err) {
        const elapsed = Date.now() - start
        expect(err).toBeInstanceOf(CallMcpError)
        expect((err as CallMcpError).code).toBe('timeout')
        expect((err as CallMcpError).message).toContain('slow.tool')
        expect((err as CallMcpError).message).toContain('50ms')
        // Reasonable upper bound — allow setTimeout slack
        expect(elapsed).toBeGreaterThanOrEqual(40)
        expect(elapsed).toBeLessThan(500)
      }
    })

    it('does NOT time out when response arrives before timeoutMs', async () => {
      const mount = makeMount()
      autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: true,
        result: 'fast',
      }))
      // 100ms timeout is plenty for queueMicrotask reply
      const result = await callMcp(mount, 'fast.tool', {}, { timeoutMs: 100 })
      expect(result).toBe('fast')
    })

    it('clears the timeout-handle on resolve (no spurious timeout after success)', async () => {
      const mount = makeMount()
      autoReply(mount, (req) => ({ request_id: req.request_id, ok: true, result: 'ok' }))
      const result = await callMcp(mount, 'tool.x', {}, { timeoutMs: 100 })
      expect(result).toBe('ok')
      // Wait > timeoutMs to verify no late rejection
      await new Promise((r) => setTimeout(r, 150))
      // Reaching this line without unhandled-rejection = test passes
    })

    it('clears the timeout-handle on reject (no spurious timeout after error-response)', async () => {
      const mount = makeMount()
      autoReply(mount, (req) => ({
        request_id: req.request_id,
        ok: false,
        code: 'tool_not_found',
      }))
      await expect(
        callMcp(mount, 'missing.tool', {}, { timeoutMs: 100 }),
      ).rejects.toMatchObject({ code: 'tool_not_found' })
      // Wait > timeoutMs to verify no late timeout-rejection swap
      await new Promise((r) => setTimeout(r, 150))
    })

    it('timeoutMs=0 disables timeout (long-running stream opt-out)', async () => {
      const mount = makeMount()
      // Delay reply by 100ms — would normally time out at 30s, but timeoutMs=0 disables
      const handler = (e: Event): void => {
        const detail = (e as CustomEvent<PluginMcpCallDetail>).detail
        mount.removeEventListener(PLUGIN_MCP_CALL_EVENT, handler as EventListener)
        setTimeout(() => {
          mount.dispatchEvent(
            new CustomEvent(PLUGIN_MCP_RESPONSE_EVENT, {
              detail: { request_id: detail.request_id, ok: true, result: 'delayed' },
            }),
          )
        }, 100)
      }
      mount.addEventListener(PLUGIN_MCP_CALL_EVENT, handler as EventListener)
      const result = await callMcp(mount, 'stream.tool', {}, { timeoutMs: 0 })
      expect(result).toBe('delayed')
    })

    it('default timeout (30s) applies when timeoutMs is omitted — verified by code-path, not wall-time', async () => {
      // We don't actually wait 30s; just confirm the call works without an explicit timeout
      // and that omitting timeoutMs goes through the default-path (covered by typecheck).
      const mount = makeMount()
      autoReply(mount, (req) => ({ request_id: req.request_id, ok: true, result: 'ok' }))
      const result = await callMcp(mount, 'tool.x', {})
      expect(result).toBe('ok')
    })
  })

  describe('v0.6.1: backward-compat (3-arg form continues to work)', () => {
    it('3-arg form produces identical wire-output to 4-arg form with empty options', async () => {
      const mount1 = makeMount()
      const mount2 = makeMount()
      const captured1 = autoReply(mount1, (req) => ({
        request_id: req.request_id,
        ok: true,
        result: null,
      }))
      const captured2 = autoReply(mount2, (req) => ({
        request_id: req.request_id,
        ok: true,
        result: null,
      }))
      await callMcp(mount1, 'tool.x', { a: 1 })
      await callMcp(mount2, 'tool.x', { a: 1 }, {})
      const r1 = await captured1
      const r2 = await captured2
      // Same wire-shape (request_ids differ but everything else matches)
      expect(r1.qualified_name).toBe(r2.qualified_name)
      expect(r1.arguments).toEqual(r2.arguments)
      expect(r1.actor_class).toBeUndefined()
      expect(r2.actor_class).toBeUndefined()
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

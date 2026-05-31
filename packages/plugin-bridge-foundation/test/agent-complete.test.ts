import { describe, expect, it, vi } from 'vitest'
import {
  AgentCompleteError,
  AgentCompleteRequestSchema,
  AgentCompleteResponseSchema,
  agentCompleteText,
  createAgentComplete,
} from '../src/agent-complete/index.js'

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init))) as unknown as typeof fetch
}

const VALID_REQUEST = {
  messages: [{ role: 'user' as const, content: 'Hello' }],
}

const VALID_RESPONSE = {
  text: 'Hi there.',
  toolCalls: [],
  stopReason: 'stop' as const,
}

describe('AgentCompleteRequestSchema', () => {
  it('accepts minimal request (messages only)', () => {
    expect(AgentCompleteRequestSchema.parse(VALID_REQUEST)).toBeDefined()
  })

  it('rejects empty messages array', () => {
    expect(() => AgentCompleteRequestSchema.parse({ messages: [] })).toThrow()
  })

  it('accepts all optional fields', () => {
    const req = AgentCompleteRequestSchema.parse({
      messages: VALID_REQUEST.messages,
      model: 'granite-4-h-tiny',
      temperature: 0.7,
      maxTokens: 200,
      cacheRetention: 'short',
      responseFormat: { type: 'json_schema', schema: { type: 'object' } },
    })
    expect(req.responseFormat?.type).toBe('json_schema')
  })

  it('rejects temperature out of range', () => {
    expect(() =>
      AgentCompleteRequestSchema.parse({ ...VALID_REQUEST, temperature: 3 }),
    ).toThrow()
  })

  it('rejects json_schema responseFormat without schema field', () => {
    expect(() =>
      AgentCompleteRequestSchema.parse({
        ...VALID_REQUEST,
        responseFormat: { type: 'json_schema' },
      }),
    ).toThrow()
  })
})

describe('AgentCompleteResponseSchema', () => {
  it('accepts minimal response', () => {
    expect(AgentCompleteResponseSchema.parse(VALID_RESPONSE)).toBeDefined()
  })

  it('defaults toolCalls to []', () => {
    const r = AgentCompleteResponseSchema.parse({
      text: 'Hi',
      stopReason: 'stop',
    })
    expect(r.toolCalls).toEqual([])
  })

  it('accepts error envelope (Drift #103 shape)', () => {
    const r = AgentCompleteResponseSchema.parse({
      text: '',
      toolCalls: [],
      stopReason: 'error',
      error: { code: 'rate_limited', message: 'too fast', retryable: true },
    })
    expect(r.error?.code).toBe('rate_limited')
  })
})

describe('createAgentComplete', () => {
  it('posts to /call-tool with tool=agent.complete envelope', async () => {
    const fetchMock = mockFetch((url, init) => {
      expect(url).toBe('http://127.0.0.1:3100/mcp/v1/call-tool')
      expect(init.method).toBe('POST')
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
      const body = JSON.parse(init.body as string)
      expect(body.tool).toBe('agent.complete')
      expect(body.arguments.messages[0].content).toBe('Hello')
      return new Response(JSON.stringify(VALID_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 'test-token',
      fetch: fetchMock,
    })
    const result = await client(VALID_REQUEST)
    expect(result.text).toBe('Hi there.')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('strips trailing /call-tool from bridgeEndpoint for re-append safety', async () => {
    const fetchMock = mockFetch((url) => {
      expect(url).toBe('http://127.0.0.1:3100/mcp/v1/call-tool')
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1/call-tool',
      sessionToken: 'test-token',
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
  })

  it('forwards X-Request-Id + x-caller-id headers when provided', async () => {
    const fetchMock = mockFetch((_url, init) => {
      const h = init.headers as Record<string, string>
      expect(h['X-Request-Id']).toBe('trace-123')
      expect(h['x-caller-id']).toBe('mind-canva@v8')
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 'test-token',
      requestId: 'trace-123',
      callerId: 'mind-canva@v8',
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
  })

  it('throws AgentCompleteError on invalid request', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 'x',
      fetch: mockFetch(() => new Response('{}', { status: 200 })),
    })
    await expect(client({ messages: [] } as never)).rejects.toMatchObject({
      code: 'invalid_request',
    })
  })

  it('throws AgentCompleteError on HTTP non-2xx', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 'x',
      fetch: mockFetch(() => new Response('Forbidden', { status: 403 })),
    })
    await expect(client(VALID_REQUEST)).rejects.toMatchObject({
      code: 'http_error',
      httpStatus: 403,
    })
  })

  it('throws AgentCompleteError on transport failure', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 'x',
      fetch: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch,
    })
    await expect(client(VALID_REQUEST)).rejects.toMatchObject({
      code: 'transport_failure',
    })
  })

  it('throws AgentCompleteError on response schema mismatch', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 'x',
      fetch: mockFetch(() =>
        new Response(JSON.stringify({ unexpected: 'shape' }), { status: 200 }),
      ),
    })
    await expect(client(VALID_REQUEST)).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('preserves Drift #103 error envelope through response (does NOT throw)', async () => {
    const errorEnvelope = {
      text: '',
      toolCalls: [],
      stopReason: 'error' as const,
      error: { code: 'rate_limited', message: 'too fast', retryable: true },
    }
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 'x',
      fetch: mockFetch(() => new Response(JSON.stringify(errorEnvelope), { status: 200 })),
    })
    const result = await client(VALID_REQUEST)
    expect(result.error?.code).toBe('rate_limited')
    expect(result.stopReason).toBe('error')
  })
})

describe('agentCompleteText convenience helper', () => {
  it('returns text on successful response', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 'x',
      fetch: mockFetch(() =>
        new Response(JSON.stringify({ ...VALID_RESPONSE, text: 'hello world' }), {
          status: 200,
        }),
      ),
    })
    expect(await agentCompleteText(client, VALID_REQUEST)).toBe('hello world')
  })

  it('throws on error envelope', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 'x',
      fetch: mockFetch(
        () =>
          new Response(
            JSON.stringify({
              text: '',
              toolCalls: [],
              stopReason: 'error',
              error: { code: 'rate_limited', message: 'slow down' },
            }),
            { status: 200 },
          ),
      ),
    })
    await expect(agentCompleteText(client, VALID_REQUEST)).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })
})

describe('AgentCompleteError class', () => {
  it('instances of Error', () => {
    const err = new AgentCompleteError('invalid_request', 'msg')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AgentCompleteError')
  })

  it('preserves httpStatus + cause', () => {
    const cause = new Error('root')
    const err = new AgentCompleteError('http_error', 'msg', 500, cause)
    expect(err.httpStatus).toBe(500)
    expect(err.cause).toBe(cause)
  })
})

// ============================================================================
// v0.7.0+ — tokenResolver + transport-mode tests
// (cluster-contract chatbus thread="contracts" 2026-05-31 § agent.complete (a)+(b),
// agent msg #~05:05 per-plugin-token-shape; oracle-FROZEN granite-floor.event.v1.3)
// ============================================================================

describe('createAgentComplete — v0.7.0 auth-options invariant', () => {
  it('throws at create-time when neither sessionToken nor tokenResolver set', () => {
    expect(() =>
      createAgentComplete({
        bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      } as never),
    ).toThrow(AgentCompleteError)
    expect(() =>
      createAgentComplete({
        bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      } as never),
    ).toThrow(/neither set/)
  })

  it('throws at create-time when BOTH sessionToken and tokenResolver set', () => {
    expect(() =>
      createAgentComplete({
        bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
        sessionToken: 'static',
        tokenResolver: () => 'dynamic',
      }),
    ).toThrow(AgentCompleteError)
    expect(() =>
      createAgentComplete({
        bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
        sessionToken: 'static',
        tokenResolver: () => 'dynamic',
      }),
    ).toThrow(/both set/)
  })

  it('throws with code=invalid_request (Drift #103 shape)', () => {
    try {
      createAgentComplete({
        bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      } as never)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentCompleteError)
      expect((err as AgentCompleteError).code).toBe('invalid_request')
    }
  })
})

describe('createAgentComplete — tokenResolver (v0.7.0)', () => {
  it('uses tokenResolver sync return as Bearer-token', async () => {
    const fetchMock = mockFetch((_url, init) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer resolved-sync')
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      tokenResolver: () => 'resolved-sync',
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('uses tokenResolver async return as Bearer-token', async () => {
    const fetchMock = mockFetch((_url, init) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer resolved-async')
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      tokenResolver: async () => 'resolved-async',
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
  })

  it('invokes tokenResolver FRESH per-request (not cached at create-time)', async () => {
    let callCount = 0
    const resolver = vi.fn(() => `token-call-${++callCount}`)
    const fetchMock = mockFetch((_url, init) => {
      const auth = (init.headers as Record<string, string>).Authorization
      // Each request should see a fresh token from resolver
      expect(auth).toMatch(/^Bearer token-call-\d+$/)
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      tokenResolver: resolver,
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
    await client(VALID_REQUEST)
    await client(VALID_REQUEST)
    expect(resolver).toHaveBeenCalledTimes(3)
  })

  it('throws invalid_request when tokenResolver returns empty string', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      tokenResolver: () => '',
      fetch: mockFetch(() => new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })),
    })
    await expect(client(VALID_REQUEST)).rejects.toMatchObject({
      code: 'invalid_request',
    })
  })

  it('throws invalid_request when tokenResolver returns non-string', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      tokenResolver: () => 12345 as unknown as string,
      fetch: mockFetch(() => new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })),
    })
    await expect(client(VALID_REQUEST)).rejects.toMatchObject({
      code: 'invalid_request',
    })
  })

  it('throws transport_failure when tokenResolver throws sync', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      tokenResolver: () => {
        throw new Error('store unavailable')
      },
      fetch: mockFetch(() => new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })),
    })
    await expect(client(VALID_REQUEST)).rejects.toMatchObject({
      code: 'transport_failure',
    })
  })

  it('throws transport_failure when tokenResolver promise rejects', async () => {
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      tokenResolver: () => Promise.reject(new Error('async store offline')),
      fetch: mockFetch(() => new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })),
    })
    await expect(client(VALID_REQUEST)).rejects.toMatchObject({
      code: 'transport_failure',
    })
  })
})

describe('createAgentComplete — transport modes (v0.7.0)', () => {
  it('default transport is v8-bridge (back-compat with v0.6.x)', async () => {
    const fetchMock = mockFetch((url, init) => {
      expect(url).toBe('http://127.0.0.1:3100/mcp/v1/call-tool')
      const body = JSON.parse(init.body as string)
      expect(body.tool).toBe('agent.complete')
      expect(body.arguments).toBeDefined()
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1',
      sessionToken: 't',
      // transport omitted → defaults to 'v8-bridge'
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
  })

  it('transport=agent-socket-direct posts raw body to bridgeEndpoint (no /call-tool append)', async () => {
    const fetchMock = mockFetch((url, init) => {
      expect(url).toBe('http://127.0.0.1:3400/agent/complete')
      const body = JSON.parse(init.body as string)
      // Direct mode: body IS the AgentCompleteRequest, no envelope
      expect(body.tool).toBeUndefined()
      expect(body.arguments).toBeUndefined()
      expect(body.messages[0].content).toBe('Hello')
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',
      transport: 'agent-socket-direct',
      sessionToken: 't',
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
  })

  it('transport=agent-socket-direct + tokenResolver (canonical Path-B)', async () => {
    // Simulates: bridge-plugin's per-plugin handshake-token-store → direct
    // Theseus agent-socket :3400/agent/complete
    let handshakeToken = 'jwt-initial'
    const tokenStore = { current: () => handshakeToken }
    const fetchMock = mockFetch((url, init) => {
      expect(url).toBe('http://127.0.0.1:3400/agent/complete')
      const auth = (init.headers as Record<string, string>).Authorization
      expect(auth).toBe(`Bearer ${handshakeToken}`)
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',
      transport: 'agent-socket-direct',
      tokenResolver: () => tokenStore.current(),
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
    // Simulate handshake-token rotation
    handshakeToken = 'jwt-rotated'
    await client(VALID_REQUEST)
  })

  it('transport=agent-socket-direct strips trailing slash from bridgeEndpoint', async () => {
    const fetchMock = mockFetch((url) => {
      expect(url).toBe('http://127.0.0.1:3400/agent/complete')
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete/',
      transport: 'agent-socket-direct',
      sessionToken: 't',
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
  })

  it('forwards X-Request-Id + x-caller-id headers in agent-socket-direct mode too', async () => {
    const fetchMock = mockFetch((_url, init) => {
      const h = init.headers as Record<string, string>
      expect(h['X-Request-Id']).toBe('trace-direct')
      expect(h['x-caller-id']).toBe('mind-canva-bridge@theseus')
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 })
    })
    const client = createAgentComplete({
      bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',
      transport: 'agent-socket-direct',
      sessionToken: 't',
      requestId: 'trace-direct',
      callerId: 'mind-canva-bridge@theseus',
      fetch: fetchMock,
    })
    await client(VALID_REQUEST)
  })
})

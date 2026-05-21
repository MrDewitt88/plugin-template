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

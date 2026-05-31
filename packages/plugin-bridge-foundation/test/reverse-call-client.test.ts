// v0.7.1+ tests for createReverseCallClient — typed wrapper for
// POST /host-bridge/v1/execute-tool with args-key-discipline +
// metadata.image_base64-extraction for image-tools.

import { describe, expect, it, vi } from 'vitest'
import {
  createHandshakeTokenStore,
  createReverseCallClient,
  REVERSE_CALL_TOOL_PREFIXES,
  ReverseCallError,
} from '../src/auth/index.js'

function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn((url: string, init: RequestInit) =>
    Promise.resolve(handler(url, init)),
  ) as unknown as typeof fetch
}

describe('REVERSE_CALL_TOOL_PREFIXES constant', () => {
  it('contains exactly the 6 prefixes per agent #~05:47', () => {
    expect(REVERSE_CALL_TOOL_PREFIXES).toEqual([
      'projects.',
      'contacts.',
      'calendar.',
      'notes.',
      'attachments.',
      'image.',
    ])
  })

  it('does NOT include agent.complete (different endpoint /agent/complete)', () => {
    expect(REVERSE_CALL_TOOL_PREFIXES).not.toContain('agent.')
  })

  it('is a readonly tuple', () => {
    // Type-level — the array is `as const`, so any mutation would TS-fail.
    // Runtime check that it's an array of strings.
    expect(Array.isArray(REVERSE_CALL_TOOL_PREFIXES)).toBe(true)
    REVERSE_CALL_TOOL_PREFIXES.forEach((p) => expect(typeof p).toBe('string'))
  })
})

describe('createReverseCallClient — basic shape', () => {
  it('posts to ${hostEndpoint}/host-bridge/v1/execute-tool', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch((url) => {
      expect(url).toBe('http://127.0.0.1:3400/host-bridge/v1/execute-tool')
      return new Response(JSON.stringify({ ok: true, value: 'ok' }), {
        status: 200,
      })
    })
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await client.executeTool('image.generate', { prompt: 'x' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('strips trailing slash from hostEndpoint', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch((url) => {
      expect(url).toBe('http://127.0.0.1:3400/host-bridge/v1/execute-tool')
      return new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 })
    })
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400/',
      tokenStore,
      fetch: fetchMock,
    })
    await client.executeTool('image.generate', {})
  })

  it('uses body key "args" not "arguments" (canonical per agent #4399)', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch((_url, init) => {
      const body = JSON.parse(init.body as string)
      expect(body.tool).toBe('image.generate')
      expect(body.args).toEqual({ prompt: 'pixel-art' })
      // KEY DISCIPLINE: must be 'args' not 'arguments'
      expect(body.arguments).toBeUndefined()
      return new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 })
    })
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await client.executeTool('image.generate', { prompt: 'pixel-art' })
  })

  it('sets Authorization Bearer from tokenStore', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt-token-x' })
    const fetchMock = mockFetch((_url, init) => {
      const auth = (init.headers as Record<string, string>).Authorization
      expect(auth).toBe('Bearer jwt-token-x')
      return new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 })
    })
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await client.executeTool('image.generate', {})
  })

  it('forwards optional X-Source-Plugin advisory header', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch((_url, init) => {
      const h = init.headers as Record<string, string>
      expect(h['X-Source-Plugin']).toBe('mind-canva')
      return new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 })
    })
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      sourcePlugin: 'mind-canva',
      fetch: fetchMock,
    })
    await client.executeTool('image.generate', {})
  })

  it('forwards optional X-Request-Id header', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch((_url, init) => {
      expect((init.headers as Record<string, string>)['X-Request-Id']).toBe(
        'trace-123',
      )
      return new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 })
    })
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      requestId: 'trace-123',
      fetch: fetchMock,
    })
    await client.executeTool('image.generate', {})
  })
})

describe('createReverseCallClient — prefix guard', () => {
  it('rejects toolName not matching REVERSE_CALL_TOOL_PREFIXES (default enforce)', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 }),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await expect(client.executeTool('apex.generate_map', {})).rejects.toMatchObject({
      code: 'forbidden_prefix',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts all 6 canonical prefixes', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 }),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    for (const p of REVERSE_CALL_TOOL_PREFIXES) {
      await client.executeTool(`${p}some_verb`, {})
    }
    expect(fetchMock).toHaveBeenCalledTimes(REVERSE_CALL_TOOL_PREFIXES.length)
  })

  it('enforcePrefixGuard: false allows arbitrary toolNames', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 }),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
      enforcePrefixGuard: false,
    })
    await client.executeTool('custom.tool', {})
    await client.executeTool('extended_allowlist.foo', {})
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('createReverseCallClient — token-store integration', () => {
  it('throws no_handshake_yet when tokenStore has no captured token', async () => {
    const tokenStore = createHandshakeTokenStore() // no initial
    const fetchMock = mockFetch(() =>
      new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 }),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await expect(client.executeTool('image.generate', {})).rejects.toMatchObject({
      code: 'no_handshake_yet',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads fresh token on each call (rotation transparent)', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt-1' })
    const seenAuth: string[] = []
    const fetchMock = mockFetch((_url, init) => {
      seenAuth.push((init.headers as Record<string, string>).Authorization)
      return new Response(JSON.stringify({ ok: true, value: 'ok' }), { status: 200 })
    })
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await client.executeTool('image.generate', {})
    tokenStore._capture('jwt-2')
    await client.executeTool('image.generate', {})
    expect(seenAuth).toEqual(['Bearer jwt-1', 'Bearer jwt-2'])
  })
})

describe('createReverseCallClient — response envelope handling', () => {
  it('passes through ok:true with value + metadata', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          value: 'human description',
          metadata: { image_base64: 'PNG_BYTES_HERE', mime: 'image/png', width: 512, height: 512 },
        }),
        { status: 200 },
      ),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    const res = await client.executeTool('image.generate', {})
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value).toBe('human description')
      expect(res.metadata?.image_base64).toBe('PNG_BYTES_HERE')
    }
  })

  it('passes through ok:false with error envelope (does NOT throw)', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'permission_denied', message: 'tool not allowed' },
        }),
        { status: 403 },
      ),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    const res = await client.executeTool('image.generate', {})
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('permission_denied')
      expect(res.error.message).toBe('tool not allowed')
    }
  })

  it('throws ReverseCallError(transport_failure) on fetch reject', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch,
    })
    await expect(client.executeTool('image.generate', {})).rejects.toMatchObject({
      code: 'transport_failure',
    })
  })

  it('throws ReverseCallError(invalid_response) on non-JSON body', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() => new Response('not-json-at-all', { status: 200 }))
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await expect(client.executeTool('image.generate', {})).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('throws ReverseCallError(invalid_response) when ok field missing', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(JSON.stringify({ value: 'no_ok_field' }), { status: 200 }),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await expect(client.executeTool('image.generate', {})).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })
})

describe('createReverseCallClient — executeImageTool typed wrapper', () => {
  it('extracts metadata.image_base64 (NOT value) per agent #4399', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          // ⚠ value is a human-readable description, base64-FREE
          value: 'Removed the background → 512×512 PNG',
          // ⚠ actual PNG bytes live in metadata.image_base64
          metadata: {
            image_base64: 'REAL_PNG_B64_HERE',
            mime: 'image/png',
            width: 512,
            height: 512,
          },
        }),
        { status: 200 },
      ),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    const img = await client.executeImageTool('image.remove_background', {
      image_base64: 'src',
    })
    expect(img.image_base64).toBe('REAL_PNG_B64_HERE')
    expect(img.mime).toBe('image/png')
    expect(img.width).toBe(512)
    expect(img.height).toBe(512)
  })

  it('threads optional seed + backend through (image.generate response)', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          value: 'Generated',
          metadata: {
            image_base64: 'BYTES',
            mime: 'image/png',
            width: 256,
            height: 256,
            seed: 12345,
            backend: 'bonsai-ternary-mlx',
          },
        }),
        { status: 200 },
      ),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    const img = await client.executeImageTool('image.generate', { prompt: 'x' })
    expect(img.seed).toBe(12345)
    expect(img.backend).toBe('bonsai-ternary-mlx')
  })

  it('throws ReverseCallError(invalid_response) when metadata.image_base64 missing', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          value: 'description',
          metadata: { mime: 'image/png' },
        }),
        { status: 200 },
      ),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await expect(
      client.executeImageTool('image.remove_background', {}),
    ).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('throws ReverseCallError with host error-code when response is ok:false', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'validation_failed', message: 'width must be ×16' },
        }),
        { status: 400 },
      ),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    await expect(client.executeImageTool('image.generate', {})).rejects.toMatchObject({
      code: 'validation_failed',
    })
  })

  it('defaults missing metadata.mime to image/png', async () => {
    const tokenStore = createHandshakeTokenStore({ initialToken: 'jwt' })
    const fetchMock = mockFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          value: 'x',
          metadata: { image_base64: 'BYTES', width: 100, height: 100 },
        }),
        { status: 200 },
      ),
    )
    const client = createReverseCallClient({
      hostEndpoint: 'http://127.0.0.1:3400',
      tokenStore,
      fetch: fetchMock,
    })
    const img = await client.executeImageTool('image.generate', {})
    expect(img.mime).toBe('image/png')
  })
})

describe('ReverseCallError class', () => {
  it('instances of Error with code + name', () => {
    const err = new ReverseCallError('permission_denied', 'denied', 403)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ReverseCallError')
    expect(err.code).toBe('permission_denied')
    expect(err.httpStatus).toBe(403)
  })

  it('preserves cause', () => {
    const cause = new Error('root')
    const err = new ReverseCallError('transport_failure', 'fetch died', undefined, cause)
    expect(err.cause).toBe(cause)
  })
})

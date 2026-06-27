import { describe, expect, it, vi } from 'vitest'
import { entitlePlugin } from '../src/entitle.js'

const ENDPOINT = 'https://nexus.example/api/licenses/entitlements/plugin'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('entitlePlugin — entitle-on-activation', () => {
  it('free auto-grant (2xx) → ok, sends slug + Bearer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }))
    const r = await entitlePlugin({
      endpoint: ENDPOINT,
      slug: 'apex-2d',
      activationToken: 'act-123',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r).toEqual({ ok: true })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer act-123')
    expect(JSON.parse(init.body as string)).toEqual({ plugin_slug: 'apex-2d' })
  })

  it('402 with detail.reason=purchase_required → purchase_required', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(402, {
        detail: { reason: 'purchase_required', message: 'Paid plugin — purchase required' },
      }),
    )
    const r = await entitlePlugin({
      endpoint: ENDPOINT,
      slug: 'med-mind',
      activationToken: 'act',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('purchase_required')
      expect(r.message).toContain('Paid plugin')
    }
  })

  it('402 with a NON-purchase_required reason → entitlement_error (not mis-allowed)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(402, { detail: { reason: 'rate_limited' } }))
    const r = await entitlePlugin({
      endpoint: ENDPOINT,
      slug: 'apex-2d',
      activationToken: 'act',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('entitlement_error')
      expect(r.message).toContain('rate_limited')
    }
  })

  it('402 without a parseable body → purchase_required (by status)', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 402 }))
    const r = await entitlePlugin({
      endpoint: ENDPOINT,
      slug: 'med-mind',
      activationToken: 'act',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('purchase_required')
  })

  it('network error → entitlement_error (never throws)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const r = await entitlePlugin({
      endpoint: ENDPOINT,
      slug: 'apex-2d',
      activationToken: 'act',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('entitlement_error')
  })

  it('unexpected status (500) → entitlement_error', async () => {
    const fetchImpl = vi.fn(async () => new Response('err', { status: 500 }))
    const r = await entitlePlugin({
      endpoint: ENDPOINT,
      slug: 'apex-2d',
      activationToken: 'act',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('entitlement_error')
  })
})

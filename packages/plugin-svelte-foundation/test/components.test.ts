import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  bridgeAttrPropsMapping,
  OBSERVED_BRIDGE_ATTRS,
  readBridgeAttrs,
} from '../src/components/bridge-attrs.js'
import {
  dispatchAskKiara,
  dispatchContextUpdate,
  dispatchError,
  dispatchNavigate,
  dispatchRefresh,
  MAX_CONTENT_BYTES,
  MAX_CONTEXT_SNAPSHOT_BYTES,
  normalizeContextUpdateDetail,
  trimToMaxBytes,
} from '../src/components/host-events.js'
import type { PluginContextUpdateDetail } from '../src/components/host-events.js'

const contractFixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/context-tool-contract-v1.json', import.meta.url), 'utf8'),
) as { context_update: PluginContextUpdateDetail }

describe('OBSERVED_BRIDGE_ATTRS', () => {
  it('enthält alle 8 Standard-Attrs (7 bridge + theme)', () => {
    expect(OBSERVED_BRIDGE_ATTRS).toEqual([
      'bridge-token',
      'bridge-endpoint',
      'host-id',
      'tenant-id',
      'user-id',
      'user-locale',
      'actor-class',
      'theme',
    ])
  })
})

describe('bridgeAttrPropsMapping', () => {
  it('liefert long-form props mapping (Drift #7 mitigation)', () => {
    const m = bridgeAttrPropsMapping()
    expect(m.bridgeToken).toEqual({ attribute: 'bridge-token' })
    expect(m.bridgeEndpoint).toEqual({ attribute: 'bridge-endpoint' })
    expect(m.theme).toEqual({ attribute: 'theme' })
  })
})

describe('readBridgeAttrs', () => {
  it('parsed alle Pflicht-Attrs', () => {
    const get = (name: string) => {
      const map: Record<string, string> = {
        'bridge-token': 'token123',
        'bridge-endpoint': 'http://localhost:3500',
        'host-id': 'teammind',
        'tenant-id': 'uuid-1',
        'user-id': 'uuid-2',
        'user-locale': 'de',
        'actor-class': 'kiara',
        theme: 'dark',
      }
      return map[name] ?? null
    }
    const attrs = readBridgeAttrs(get)
    expect(attrs).not.toBeNull()
    expect(attrs?.bridgeToken).toBe('token123')
    expect(attrs?.theme).toBe('dark')
    expect(attrs?.actorClass).toBe('kiara')
  })

  it('returnt null wenn pflicht-attr fehlt', () => {
    const get = (_: string) => null
    expect(readBridgeAttrs(get)).toBeNull()
  })

  it('actor-class fallback auf user bei invalid value', () => {
    const get = (name: string) =>
      ({
        'bridge-token': 'x',
        'bridge-endpoint': 'x',
        'host-id': 'x',
        'tenant-id': 'x',
        'user-id': 'x',
        'actor-class': 'invalid',
      })[name] ?? null
    const attrs = readBridgeAttrs(get)
    expect(attrs?.actorClass).toBe('user')
  })

  it('theme fallback auf auto bei invalid value', () => {
    const get = (name: string) =>
      ({
        'bridge-token': 'x',
        'bridge-endpoint': 'x',
        'host-id': 'x',
        'tenant-id': 'x',
        'user-id': 'x',
        theme: 'rainbow',
      })[name] ?? null
    const attrs = readBridgeAttrs(get)
    expect(attrs?.theme).toBe('auto')
  })

  it('user-locale fallback auf en wenn fehlt', () => {
    const get = (name: string) =>
      ({
        'bridge-token': 'x',
        'bridge-endpoint': 'x',
        'host-id': 'x',
        'tenant-id': 'x',
        'user-id': 'x',
      })[name] ?? null
    const attrs = readBridgeAttrs(get)
    expect(attrs?.userLocale).toBe('en')
  })
})

describe('dispatch*-helpers', () => {
  function makeTarget(): {
    target: EventTarget
    received: { type: string; detail: unknown; bubbles: boolean; composed: boolean }[]
  } {
    const target = new EventTarget()
    const received: {
      type: string
      detail: unknown
      bubbles: boolean
      composed: boolean
    }[] = []
    const types = [
      'plugin:navigate',
      'plugin:refresh',
      'plugin:error',
      'plugin:ask-kiara',
      'plugin:context-update',
    ]
    for (const t of types) {
      target.addEventListener(t, (e) => {
        const ce = e as CustomEvent
        received.push({
          type: e.type,
          detail: ce.detail,
          bubbles: ce.bubbles,
          composed: ce.composed,
        })
      })
    }
    return { target, received }
  }

  it('dispatchNavigate emits CustomEvent mit bubbles+composed', () => {
    const { target, received } = makeTarget()
    dispatchNavigate(target, { route_path: '/foo' })
    expect(received).toHaveLength(1)
    expect(received[0]!.type).toBe('plugin:navigate')
    expect(received[0]!.detail).toEqual({ route_path: '/foo' })
    expect(received[0]!.bubbles).toBe(true)
    expect(received[0]!.composed).toBe(true)
  })

  it('dispatchRefresh emits mit empty detail default', () => {
    const { target, received } = makeTarget()
    dispatchRefresh(target)
    expect(received[0]!.detail).toEqual({})
  })

  it('dispatchError emits code+message', () => {
    const { target, received } = makeTarget()
    dispatchError(target, { code: 'oops', message: 'bad' })
    expect(received[0]!.detail).toEqual({ code: 'oops', message: 'bad' })
  })

  it('dispatchAskKiara emits full detail', () => {
    const { target, received } = makeTarget()
    dispatchAskKiara(target, {
      context: 'document-detail',
      document_id: 'doc-1',
      capabilities: ['markdown', 'katex'],
    })
    expect(received[0]!.type).toBe('plugin:ask-kiara')
    expect(received[0]!.detail).toMatchObject({
      context: 'document-detail',
      document_id: 'doc-1',
      capabilities: ['markdown', 'katex'],
    })
  })

  it('dispatchContextUpdate emits a bounded data snapshot across shadow boundaries', () => {
    const { target, received } = makeTarget()
    dispatchContextUpdate(target, contractFixture.context_update)
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      type: 'plugin:context-update',
      detail: contractFixture.context_update,
      bubbles: true,
      composed: true,
    })
    expect(received[0]!.detail).not.toHaveProperty('plugin_id')
    expect(received[0]!.detail).not.toHaveProperty('suggested_prompt')
  })

  it('trims UTF-8 content and marks truncation; rejects oversized selection', () => {
    const content = 'a'.repeat(MAX_CONTENT_BYTES - 2) + '🎉'
    const snapshot = normalizeContextUpdateDetail({
      ...contractFixture.context_update,
      full_content: content,
    })
    expect(snapshot.full_content_truncated).toBe(true)
    expect(new TextEncoder().encode(snapshot.full_content).length).toBeLessThanOrEqual(
      MAX_CONTENT_BYTES,
    )
    expect(new TextEncoder().encode(JSON.stringify(snapshot)).length).toBeLessThanOrEqual(
      MAX_CONTEXT_SNAPSHOT_BYTES,
    )
    expect(snapshot.selection).toBe(contractFixture.context_update.selection)
    expect(snapshot.full_content).not.toContain('�')
    expect(() =>
      normalizeContextUpdateDetail({
        ...contractFixture.context_update,
        selection: 'x'.repeat(8_001),
      }),
    ).toThrow(/selection/)
  })

  it('accounts for JSON escaping within the whole-snapshot budget', () => {
    const snapshot = normalizeContextUpdateDetail({
      ...contractFixture.context_update,
      full_content: '\n'.repeat(MAX_CONTENT_BYTES),
    })
    expect(new TextEncoder().encode(JSON.stringify(snapshot)).length).toBeLessThanOrEqual(
      MAX_CONTEXT_SNAPSHOT_BYTES,
    )
    expect(snapshot.full_content_truncated).toBe(true)
    expect(snapshot.selection).toBe(contractFixture.context_update.selection)
  })

  it('rejects invalid view keys and extra references before dispatch', () => {
    expect(() =>
      normalizeContextUpdateDetail({
        ...contractFixture.context_update,
        view_id: '',
      }),
    ).toThrow(/view_id/)
    expect(() =>
      normalizeContextUpdateDetail({
        ...contractFixture.context_update,
        references: Array.from({ length: 17 }, (_, i) => ({ kind: 'item', id: String(i) })),
      }),
    ).toThrow(/references/)
  })
})

describe('trimToMaxBytes', () => {
  it('text < max → kein truncation', () => {
    const r = trimToMaxBytes('hello world', 100)
    expect(r.text).toBe('hello world')
    expect(r.truncated).toBe(false)
  })

  it('text > max → truncated', () => {
    const long = 'x'.repeat(60_000)
    const r = trimToMaxBytes(long)
    expect(r.text.length).toBeLessThanOrEqual(MAX_CONTENT_BYTES)
    expect(r.truncated).toBe(true)
  })

  it('UTF-8-safe — kein broken multibyte char', () => {
    // 50001 bytes mit emoji am Ende — emoji ist 4 bytes in UTF-8
    const text = 'a'.repeat(MAX_CONTENT_BYTES - 2) + '🎉'
    const r = trimToMaxBytes(text)
    expect(r.truncated).toBe(true)
    // Decoded text shouldn't have replacement-character (would mean broken)
    expect(r.text.endsWith('�')).toBe(false)
  })

  it('default max ist MAX_CONTENT_BYTES (50_000)', () => {
    expect(MAX_CONTENT_BYTES).toBe(50_000)
  })
})

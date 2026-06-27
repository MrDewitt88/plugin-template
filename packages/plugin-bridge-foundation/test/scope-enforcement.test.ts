// v0.8.0 — opt-in per-tool scope-enforcement on /execute-tool.
//
// End-to-end (authed POST through createBridgeApp) + direct unit tests of the
// pure checkToolScopes helper. Locks: default-off backward-compat, plugin-wide
// floor, per-tool union, wildcard semantics, tool_not_found precedence, and the
// 403 insufficient_scope error shape (markview #5206 / plug-ea).

import { describe, expect, it } from 'vitest'
import { createBridgeApp } from '../src/server.js'
import { buildTestRegistry } from '../src/testing/index.js'
import { checkToolScopes } from '../src/auth/scope-check.js'
import type { PluginManifest, ToolHandler } from '../src/types.js'

const TENANT = '00000000-0000-0000-0000-000000000001'
const USER = '00000000-0000-0000-0000-000000000002'

function manifest(opts: {
  pluginWide?: string[]
  tools?: Array<string | { name: string; scopes_required?: string[] }>
}): PluginManifest {
  return {
    id: 'test-plugin',
    name: { de: 'T', en: 'T' },
    description: { de: 'T', en: 'T' },
    version: '0.1.0',
    distribution: { type: 'external-service', service_endpoint: 'http://127.0.0.1:3600' },
    compatibility: { apps: ['teammind'], min_app_version: '0.5.0' },
    provides: {
      routes: [],
      mcp_tools: opts.tools ?? [],
      module_extensions: [],
      scopes_required: opts.pluginWide ?? [],
    },
  } as PluginManifest
}

const okHandler: ToolHandler = async () => ({ did: 'run' })

async function callTool(args: {
  manifest: PluginManifest
  enforceScopes?: boolean
  toolHandlers?: Record<string, ToolHandler>
  toolName: string
  scopes: string[]
}) {
  const handle = await buildTestRegistry({ hostId: 'teammind' })
  const app = createBridgeApp({
    manifest: args.manifest,
    registry: handle.registry,
    toolHandlers: args.toolHandlers ?? { [args.toolName]: okHandler },
    ...(args.enforceScopes !== undefined ? { enforceScopes: args.enforceScopes } : {}),
  })
  const token = await handle.mintToken({
    pluginId: 'test-plugin',
    tenantId: TENANT,
    userId: USER,
    scopes: args.scopes,
  })
  const res = await app.request('http://localhost/plugin-bridge/v1/execute-tool', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool_name: args.toolName,
      arguments: {},
      tenant_id: TENANT,
      user_id: USER,
    }),
  })
  const body = (await res.json()) as {
    ok: boolean
    result?: unknown
    error?: { code: string; message: string; details?: { required: string[]; missing: string[] } }
  }
  return { status: res.status, body }
}

describe('execute-tool scope-enforcement (v0.8.0)', () => {
  describe('default off — backward compatible', () => {
    it('omitted enforceScopes: tool with scopes_required + caller with NO scopes → 200 ok', async () => {
      const { status, body } = await callTool({
        manifest: manifest({
          pluginWide: ['mcp.base'],
          tools: [{ name: 't', scopes_required: ['t.write'] }],
        }),
        toolName: 't',
        scopes: [],
      })
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.result).toEqual({ did: 'run' })
    })

    it('explicit enforceScopes:false → same (no enforcement)', async () => {
      const { status, body } = await callTool({
        manifest: manifest({ pluginWide: ['mcp.base'] }),
        enforceScopes: false,
        toolName: 't',
        scopes: [],
      })
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
    })
  })

  describe('plugin-wide floor', () => {
    it('caller has floor → 200', async () => {
      const { status, body } = await callTool({
        manifest: manifest({ pluginWide: ['mcp.base'] }),
        enforceScopes: true,
        toolName: 't',
        scopes: ['mcp.base'],
      })
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('caller lacks floor → 403 insufficient_scope', async () => {
      const { status, body } = await callTool({
        manifest: manifest({ pluginWide: ['mcp.base'] }),
        enforceScopes: true,
        toolName: 't',
        scopes: [],
      })
      expect(status).toBe(403)
      expect(body.ok).toBe(false)
      expect(body.error?.code).toBe('insufficient_scope')
      expect(body.error?.details?.missing).toEqual(['mcp.base'])
    })
  })

  describe('per-tool union', () => {
    const m = manifest({
      pluginWide: ['mcp.base'],
      tools: [{ name: 'notes.create', scopes_required: ['notes.write'] }],
    })

    it('caller has floor + per-tool → 200', async () => {
      const { status, body } = await callTool({
        manifest: m,
        enforceScopes: true,
        toolName: 'notes.create',
        scopes: ['mcp.base', 'notes.write'],
      })
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('caller missing per-tool → 403, missing===[per-tool]', async () => {
      const { status, body } = await callTool({
        manifest: m,
        enforceScopes: true,
        toolName: 'notes.create',
        scopes: ['mcp.base'],
      })
      expect(status).toBe(403)
      expect(body.error?.details?.missing).toEqual(['notes.write'])
      expect(body.error?.details?.required).toEqual(['mcp.base', 'notes.write'])
    })

    it('caller missing floor but has per-tool → 403, missing===[floor]', async () => {
      const { status, body } = await callTool({
        manifest: m,
        enforceScopes: true,
        toolName: 'notes.create',
        scopes: ['notes.write'],
      })
      expect(status).toBe(403)
      expect(body.error?.details?.missing).toEqual(['mcp.base'])
    })
  })

  describe('wildcard caller scopes', () => {
    const reqTool = (scopes: string[], toolName = 'notes.read') =>
      callTool({
        manifest: manifest({ tools: [{ name: 'notes.read', scopes_required: ['notes.read'] }] }),
        enforceScopes: true,
        toolName,
        scopes,
      })

    it('descendant: notes.* satisfies notes.read → 200', async () => {
      expect((await reqTool(['notes.*'])).status).toBe(200)
    })
    it('sibling prefix: other.* does NOT satisfy notes.read → 403', async () => {
      expect((await reqTool(['other.*'])).status).toBe(403)
    })
    it('boundary e2e: notes.* does NOT satisfy required notesX.read → 403, missing asserted', async () => {
      const { status, body } = await callTool({
        manifest: manifest({ tools: [{ name: 't', scopes_required: ['notesX.read'] }] }),
        enforceScopes: true,
        toolName: 't',
        scopes: ['notes.*'],
      })
      expect(status).toBe(403)
      expect(body.error?.details?.missing).toEqual(['notesX.read'])
    })
  })

  describe('manifest forms & precedence', () => {
    it('string-form mcp_tools entry → only floor applies (no per-tool scopes)', async () => {
      const { status } = await callTool({
        manifest: manifest({ pluginWide: ['mcp.base'], tools: ['t'] }),
        enforceScopes: true,
        toolName: 't',
        scopes: ['mcp.base'],
      })
      expect(status).toBe(200)
    })

    it('tool not in manifest at all → floor still enforced', async () => {
      const { status, body } = await callTool({
        manifest: manifest({ pluginWide: ['mcp.base'], tools: [] }),
        enforceScopes: true,
        toolName: 'ghost',
        scopes: [],
      })
      expect(status).toBe(403)
      expect(body.error?.details?.missing).toEqual(['mcp.base'])
    })

    it('tool not in manifest + empty floor → 200 (nothing required)', async () => {
      const { status } = await callTool({
        manifest: manifest({}),
        enforceScopes: true,
        toolName: 'ghost',
        scopes: [],
      })
      expect(status).toBe(200)
    })

    it('tool_not_found wins over scope check (no info leak)', async () => {
      const { status, body } = await callTool({
        manifest: manifest({ pluginWide: ['mcp.base'] }),
        enforceScopes: true,
        toolHandlers: { other: okHandler }, // requested tool has NO handler
        toolName: 'requested',
        scopes: [],
      })
      expect(status).toBe(200) // ok:false body, not 403
      expect(body.ok).toBe(false)
      expect(body.error?.code).toBe('tool_not_found')
    })
  })
})

describe('checkToolScopes (pure helper — parity with plugin-mcp-foundation)', () => {
  const m = (
    pluginWide: string[],
    tools: Array<string | { name: string; scopes_required?: string[] }>,
  ) => manifest({ pluginWide, tools })

  it('empty required + empty caller → ok', () => {
    expect(checkToolScopes(m([], []), 't', []).ok).toBe(true)
  })
  it('empty caller + non-empty required → not ok', () => {
    const r = checkToolScopes(m(['x'], []), 't', [])
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['x'])
  })
  it('union dedup: plugin-wide ∪ per-tool, single x', () => {
    const r = checkToolScopes(m(['x'], [{ name: 't', scopes_required: ['x'] }]), 't', ['x'])
    expect(r.required).toEqual(['x'])
    expect(r.ok).toBe(true)
  })
  it('wildcard matches bare prefix: notes.* satisfies required "notes"', () => {
    const r = checkToolScopes(m(['notes'], []), 't', ['notes.*'])
    expect(r.ok).toBe(true)
  })
  it('wildcard does NOT cross sibling prefix: notes.* vs notesX.read', () => {
    const r = checkToolScopes(m([], [{ name: 't', scopes_required: ['notesX.read'] }]), 't', [
      'notes.*',
    ])
    expect(r.ok).toBe(false)
  })
  it('exact scope without wildcard', () => {
    expect(checkToolScopes(m(['a.b'], []), 't', ['a.b']).ok).toBe(true)
    expect(checkToolScopes(m(['a.b'], []), 't', ['a.c']).ok).toBe(false)
  })
  it('bare prefix without wildcard does NOT match dotted required (both directions)', () => {
    // 'notes' must not satisfy 'notes.read' and vice-versa (prefix-match is wildcard-only)
    expect(checkToolScopes(m(['notes.read'], []), 't', ['notes']).ok).toBe(false)
    expect(checkToolScopes(m(['notes'], []), 't', ['notes.read']).ok).toBe(false)
  })
})

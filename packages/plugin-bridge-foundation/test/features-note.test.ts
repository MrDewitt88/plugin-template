import { describe, expect, it } from 'vitest'
import { renderFeaturesNote } from '../src/manifest/features-note.js'
import { computeManifestHash } from '../src/manifest/hash.js'
import { validateManifest } from '../src/manifest/loader.js'

function manifest(overrides: Record<string, unknown> = {}) {
  return validateManifest({
    id: 'chatbus-mind',
    name: { de: 'Chatbus', en: 'Chatbus' },
    description: { de: 'Bridge', en: 'Bridge' },
    version: '0.1.1',
    distribution: { type: 'external-service', service_endpoint: 'http://127.0.0.1:3760' },
    compatibility: { apps: ['teammind', 'theseus'], min_app_version: '1.0.0' },
    provides: {
      routes: [],
      mcp_tools: [],
      module_extensions: [],
      scopes_required: [],
    },
    ...overrides,
  })
}

describe('renderFeaturesNote', () => {
  it('renders header with version, hosts and min_app_version', () => {
    const md = renderFeaturesNote(manifest())
    expect(md).toContain('# chatbus-mind — Feature-Inventar (generiert)')
    expect(md).toContain('`manifest.chatbus-mind.yaml`')
    expect(md).toContain('Version `0.1.1`')
    expect(md).toContain('`teammind`, `theseus`')
    expect(md).toContain('min_app_version `1.0.0`')
  })

  it('embeds the manifest_hash for staleness detection when given', () => {
    const m = manifest()
    const hash = computeManifestHash(m)
    const md = renderFeaturesNote(m, { manifestHash: hash })
    expect(md).toContain(hash)
    expect(md).toContain('veraltet')
  })

  it('is deterministic — same manifest renders byte-identically', () => {
    const m = manifest()
    expect(renderFeaturesNote(m)).toBe(renderFeaturesNote(m))
  })

  it('omits a date by default (determinism) but honours generatedAt', () => {
    expect(renderFeaturesNote(manifest())).not.toContain('Stand:')
    expect(renderFeaturesNote(manifest(), { generatedAt: '2026-07-20' })).toContain('Stand: 2026-07-20')
  })

  it('renders both string-form and extended-form mcp_tools', () => {
    const md = renderFeaturesNote(
      manifest({
        provides: {
          routes: [],
          module_extensions: [],
          scopes_required: [],
          mcp_tools: [
            'chatbus.notes_read',
            {
              name: 'chatbus.floor_summary',
              description: 'Granite-Floor pass rates per repo.\nSecond line ignored.',
              scopes_required: ['mcp.read.chatbus'],
            },
          ],
        },
      }),
    )
    expect(md).toContain('## MCP-Tools (2)')
    // string-form: no description/scopes
    expect(md).toContain('| `chatbus.notes_read` | — | — |')
    // extended-form: first description line + scopes
    expect(md).toContain('| `chatbus.floor_summary` | `mcp.read.chatbus` | Granite-Floor pass rates per repo. |')
    expect(md).not.toContain('Second line ignored')
  })

  it('escapes pipes so a description cannot break the table', () => {
    const md = renderFeaturesNote(
      manifest({
        provides: {
          routes: [],
          module_extensions: [],
          scopes_required: [],
          mcp_tools: [{ name: 'x.y', description: 'a | b' }],
        },
      }),
    )
    expect(md).toContain('a \\| b')
  })

  it('renders routes and module-extensions with sorted hook names', () => {
    const md = renderFeaturesNote(
      manifest({
        provides: {
          mcp_tools: [],
          scopes_required: [],
          routes: [
            { path: '/board', component_type: 'web-component', service_endpoint: '/ui/board' },
          ],
          module_extensions: [
            {
              module: 'notes',
              capability: 'versioning',
              hook_endpoints: { on_save: '/h/save', on_delete: '/h/del' },
            },
          ],
        },
      }),
    )
    expect(md).toContain('## Routes (1)')
    expect(md).toContain('| `/board` | web-component | `/ui/board` |')
    expect(md).toContain('## Module-Extensions (1)')
    // sorted: on_delete before on_save
    expect(md).toContain('| `notes` | `versioning` | `on_delete`, `on_save` |')
  })

  it('omits empty sections entirely', () => {
    const md = renderFeaturesNote(manifest())
    expect(md).not.toContain('## MCP-Tools')
    expect(md).not.toContain('## Routes')
    expect(md).not.toContain('## Module-Extensions')
  })

  it('always states the full mint formula, so the grant line cannot mislead', () => {
    // Die Grant-Zeile allein wäre irreführend: der Host mintet zusätzlich den
    // Per-Tool-Union (ratifiziert, oracle #5418). Deshalb IMMER mitrendern.
    for (const md of [
      renderFeaturesNote(manifest()),
      renderFeaturesNote(manifest({ requires: { scopes: ['family.audit.write'] } })),
    ]) {
      expect(md).toContain('⋃ mcp_tools[].scopes_required')
      expect(md).toContain('Outgoing-Grant deklariert')
    }
    // ohne requires: explizit als "nicht deklariert" ausgewiesen, nicht verschwiegen
    expect(renderFeaturesNote(manifest())).toContain('nicht deklariert')
  })

  it('names the REAL source file and flags a deprecated bare manifest', () => {
    const def = renderFeaturesNote(manifest())
    expect(def).toContain('`manifest.chatbus-mind.yaml`')
    expect(def).not.toContain('DEPRECATED')

    const bare = renderFeaturesNote(manifest(), {
      sourceFilename: 'manifest.yaml',
      deprecatedSource: true,
    })
    expect(bare).toContain('Generiert aus `manifest.yaml`')
    expect(bare).toContain('DEPRECATED')
  })

  it('escapes backslashes and lone CR so a cell cannot break out', () => {
    const md = renderFeaturesNote(
      manifest({
        provides: {
          routes: [],
          module_extensions: [],
          scopes_required: [],
          mcp_tools: [{ name: 'x.y', description: 'a \\| b\rsecond' }],
        },
      }),
    )
    const row = md.split('\n').find((l) => l.startsWith('| `x.y`'))
    expect(row).toBeDefined()
    // Das einzelne CR darf keine zusätzliche Zeile erzeugen …
    expect(md).not.toContain('second')
    // … und der Backslash muss escaped sein (sonst frisst er das folgende `\|`).
    expect(row).toContain('\\\\')
    expect(row!.endsWith('|')).toBe(true)
  })

  it('neutralises raw HTML/backticks in free-form descriptions', () => {
    const md = renderFeaturesNote(
      manifest({
        provides: {
          routes: [],
          module_extensions: [],
          scopes_required: [],
          mcp_tools: [{ name: 'x.y', description: '<img src=x onerror=alert(1)> `code`' }],
        },
      }),
    )
    expect(md).not.toContain('<img')
    expect(md).toContain('&lt;img')
  })

  it('shows the incoming floor, and the declared outgoing grant', () => {
    const withoutGrant = renderFeaturesNote(manifest())
    expect(withoutGrant).toContain('_keiner (granular pro Tool)_')

    const withGrant = renderFeaturesNote(
      manifest({
        provides: {
          routes: [],
          mcp_tools: [],
          module_extensions: [],
          scopes_required: ['mcp.read.chatbus'],
        },
        requires: { scopes: ['family.audit.write'] },
      }),
    )
    expect(withGrant).toContain('Incoming-Floor')
    expect(withGrant).toContain('`mcp.read.chatbus`')
    expect(withGrant).toContain('Outgoing-Grant')
    expect(withGrant).toContain('`family.audit.write`')
  })

  it('renders the distribution block', () => {
    const md = renderFeaturesNote(manifest())
    expect(md).toContain('## Distribution')
    expect(md).toContain('`external-service`')
    expect(md).toContain('`http://127.0.0.1:3760`')
  })
})

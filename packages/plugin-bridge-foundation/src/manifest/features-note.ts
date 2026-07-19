// Manifest → Feature-Katalog (Markdown) für die Chatbus-Notes-Registry
// `repo/<role>/features` (Contract #6, rust-chatbus #7557/#7592).
//
// Schnitt (ratifiziert): plug-tmpl liefert **Manifest → Markdown** — pure,
// zero-network, zero-auth. Der Bus-Append (`append_note` mit `supersedes`)
// bleibt in der aufrufenden Session, weil dort Identität + Vorgänger-id leben.
//
// Bewusst DETERMINISTISCH: kein Datum, keine Zufallswerte, stabile Sortierung.
// Gleiches Manifest ⇒ byte-identische Note ⇒ ein Re-Append lässt sich sparen.
// Staleness läuft über `manifest_hash` (identisch mit dem, den die Bridge im
// `/health` meldet), nicht über einen Zeitstempel.

import type { PluginManifest, PluginMcpToolEntry } from '../types.js'

export interface RenderFeaturesNoteOptions {
  /**
   * `computeManifestHash(manifest)` — eingebettet zur Staleness-Erkennung:
   * weicht er vom `/health`-Hash der laufenden Bridge ab, ist die Note veraltet.
   */
  manifestHash?: string
  /** Optionale „Stand"-Zeile. Weggelassen by default, damit die Ausgabe deterministisch bleibt. */
  generatedAt?: string
  /**
   * Die TATSÄCHLICH geladene Manifest-Datei (`DiscoveredManifest.filename`).
   * Ohne diese Angabe wird `manifest.<id>.yaml` angenommen — auf dem noch
   * unterstützten deprecated bare-`manifest.yaml`-Pfad wäre das ein Dateiname,
   * den es im Repo gar nicht gibt.
   */
  sourceFilename?: string
  /** `DiscoveredManifest.deprecated` — rendert einen sichtbaren Hinweis. */
  deprecatedSource?: boolean
}

/**
 * Tabellenzellen-sicher. Reihenfolge zählt: erst Backslashes, dann Pipes —
 * sonst würde ein bereits vorhandenes `\|` doppelt-verarbeitet. CR, CRLF und
 * LF werden alle platt gemacht (ein einzelnes CR bricht die Tabelle sonst auch).
 */
function cell(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n?|\n/g, ' ')
    .trim()
}

/**
 * Freitext, der OHNE Code-Span gerendert wird (Tool-Descriptions) — hier muss
 * zusätzlich Markdown/HTML entschärft werden, weil der Note-Body als Markdown
 * gerendert wird und Manifest-Inhalt untrusted ist.
 */
function prose(s: string): string {
  return cell(s).replace(/</g, '&lt;').replace(/`/g, '\\`')
}

function code(s: string): string {
  return '`' + cell(s) + '`'
}

function codeList(items: readonly string[]): string {
  return items.map(code).join(', ')
}

/** Erste nicht-leere Zeile einer (ggf. mehrzeiligen) Description. */
function firstLine(s: string | undefined): string {
  if (!s) return '—'
  const line = s
    .split(/\r\n?|\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return line ? prose(line) : '—'
}

function toolName(t: PluginMcpToolEntry): string {
  return typeof t === 'string' ? t : t.name
}

function toolDescription(t: PluginMcpToolEntry): string {
  return typeof t === 'string' ? '—' : firstLine(t.description)
}

function toolScopes(t: PluginMcpToolEntry): string {
  const scopes = typeof t === 'string' ? [] : (t.scopes_required ?? [])
  return scopes.length ? codeList(scopes) : '—'
}

/**
 * Rendert einen Markdown-Feature-Katalog aus einem validierten Manifest —
 * geeignet als Body für `append_note(topic: "repo/<role>/features")`.
 *
 * Leere Abschnitte (keine Tools/Routes/Extensions) werden weggelassen.
 */
export function renderFeaturesNote(
  manifest: PluginManifest,
  opts: RenderFeaturesNoteOptions = {},
): string {
  const out: string[] = []

  out.push(`# ${manifest.id} — Feature-Inventar (generiert)`)
  out.push('')
  const source = opts.sourceFilename ?? `manifest.${manifest.id}.yaml`
  out.push(
    `> Generiert aus ${code(source)} — **nicht von Hand editieren**, sondern neu generieren.`,
  )
  if (opts.deprecatedSource) {
    out.push(
      `> ⚠️ Quelle ist das DEPRECATED bare ${code('manifest.yaml')} — auf ${code(`manifest.${manifest.id}.yaml`)} umbenennen.`,
    )
  }
  out.push(
    '> ' +
      [
        `Version ${code(manifest.version)}`,
        `Hosts: ${codeList(manifest.compatibility.apps)}`,
        `min_app_version ${code(manifest.compatibility.min_app_version)}`,
      ].join(' · '),
  )
  if (opts.manifestHash) {
    out.push(
      `> ${code('manifest_hash')}: ${code(opts.manifestHash)} — weicht er vom ${code('/health')}-Hash der laufenden Bridge ab, ist diese Note veraltet.`,
    )
  }
  if (opts.generatedAt) out.push(`> Stand: ${cell(opts.generatedAt)}`)
  out.push('')

  const tools = manifest.provides.mcp_tools
  if (tools.length > 0) {
    out.push(`## MCP-Tools (${tools.length})`)
    out.push('')
    out.push('| Tool | Scopes | Beschreibung |')
    out.push('|---|---|---|')
    for (const t of tools) {
      out.push(`| ${code(toolName(t))} | ${toolScopes(t)} | ${toolDescription(t)} |`)
    }
    out.push('')
  }

  const routes = manifest.provides.routes
  if (routes.length > 0) {
    out.push(`## Routes (${routes.length})`)
    out.push('')
    out.push('| Pfad | Typ | Service-Endpoint |')
    out.push('|---|---|---|')
    for (const r of routes) {
      out.push(`| ${code(r.path)} | ${cell(r.component_type)} | ${code(r.service_endpoint)} |`)
    }
    out.push('')
  }

  const extensions = manifest.provides.module_extensions
  if (extensions.length > 0) {
    out.push(`## Module-Extensions (${extensions.length})`)
    out.push('')
    out.push('| Modul | Capability | Hooks |')
    out.push('|---|---|---|')
    for (const e of extensions) {
      const hookNames = Object.keys(e.hook_endpoints).sort()
      out.push(
        `| ${code(e.module)} | ${code(e.capability)} | ${hookNames.length ? codeList(hookNames) : '—'} |`,
      )
    }
    out.push('')
  }

  out.push('## Scopes')
  out.push('')
  const floor = manifest.provides.scopes_required
  out.push(
    `- **Incoming-Floor** (${code('provides.scopes_required')} — was ein Caller dieses Plugins halten muss): ` +
      (floor.length ? codeList(floor) : '_keiner (granular pro Tool)_'),
  )
  const grant = manifest.requires?.scopes ?? []
  out.push(
    `- **Outgoing-Grant deklariert** (${code('requires.scopes')}): ` +
      (grant.length
        ? codeList(grant)
        : `_nicht deklariert — der Host nimmt dann ${code('provides.scopes_required')} als Seed_`),
  )
  out.push('')
  // Bewusst immer mitgerendert: die Grant-Zeile allein wäre irreführend, weil der
  // Host zusätzlich den Per-Tool-Union mintet (ratifiziert, oracle #5418).
  out.push(
    `> Was der Host tatsächlich ins Token mintet: ${code('(requires.scopes ?? provides.scopes_required) ∪ ⋃ mcp_tools[].scopes_required')}`,
  )
  out.push('')

  out.push('## Distribution')
  out.push('')
  out.push(`- Typ: ${code(manifest.distribution.type)}`)
  if (manifest.distribution.service_endpoint) {
    out.push(`- Service-Endpoint: ${code(manifest.distribution.service_endpoint)}`)
  }
  out.push('')

  return out.join('\n')
}

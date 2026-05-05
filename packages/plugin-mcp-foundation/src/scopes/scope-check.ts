// Per-Tool Scope-Check (Phase-3 PROTOCOL.md §4 Per-Tool scopes_required
// Semantics).
//
// Plugin-wide `scopes_required` ist Floor — JEDER Tool-Call braucht ALL
// plugin-wide Scopes. Tool-spezifische `scopes_required` ist union-extend
// statt replace.
//
// V8/Theseus Permission-Check pre-execute-tool: caller-scopes muss
// SUPERSET sein von (plugin-wide ∪ tool-specific).

import type { NormalizedTool } from '../tools/types.js'

export interface ScopeCheckOptions {
  /** plugin-wide scopes_required aus manifest.provides.scopes_required. */
  pluginWideScopes: string[]
  /** scopes des callers (aus JWT-claim). */
  callerScopes: string[]
  /** tool, der gerufen werden soll. */
  tool: NormalizedTool
}

export interface ScopeCheckResult {
  ok: boolean
  /** missing scopes — präzise message für error-response. */
  missing: string[]
  /** required = plugin-wide ∪ tool-specific (deduped). */
  required: string[]
}

/**
 * Berechnet required-set + checkt ob caller-scopes ALL davon enthält.
 *
 * Wildcard-Convention: `mcp.plugin.*` matcht alle scopes mit prefix
 * `mcp.plugin.` — V8s admin-cookie-Convention. Plugin-Foundation
 * implementiert die Wildcard-Logic damit Plugin-Provider nicht selbst
 * basteln müssen.
 */
export function checkScopes(opts: ScopeCheckOptions): ScopeCheckResult {
  const required = Array.from(
    new Set([...opts.pluginWideScopes, ...opts.tool.scopes_required]),
  )
  const missing: string[] = []

  for (const req of required) {
    if (!callerHasScope(opts.callerScopes, req)) {
      missing.push(req)
    }
  }

  return { ok: missing.length === 0, missing, required }
}

/**
 * Caller hat scope wenn:
 *   1. exact-match in callerScopes
 *   2. wildcard-match: `caller.<prefix>.*` matcht jeden `<prefix>.<sub>`
 *
 * Beispiel: callerScopes=['mcp.plugin.*'], required='mcp.plugin.markview.read'
 * → matchet via wildcard.
 */
function callerHasScope(callerScopes: string[], required: string[number]): boolean {
  if (callerScopes.includes(required)) return true
  for (const cs of callerScopes) {
    if (!cs.endsWith('.*')) continue
    const prefix = cs.slice(0, -2)
    if (required === prefix) return true // exact-prefix-match
    if (required.startsWith(prefix + '.')) return true
  }
  return false
}

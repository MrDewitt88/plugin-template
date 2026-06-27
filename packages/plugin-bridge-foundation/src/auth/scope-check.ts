// Per-Tool Scope-Enforcement für /execute-tool (v0.8.0).
//
// Opt-in via BridgeAppOptions.enforceScopes. Schließt die Lücke, die markview
// (#5206) + plug-ea gemeldet haben: der Host deklariert per-Tool/plugin-wide
// `scopes_required`, aber die Foundation hat sie nie gegen `claims.scopes`
// erzwungen — ein read-only-Token konnte write-Tools aufrufen.
//
// PURE + self-contained (keine I/O, keine cross-package-Dependency). Spiegelt
// bewusst die Scope-Semantik aus `@nexus-mindgarden/plugin-mcp-foundation`
// (`checkScopes`) — NICHT importiert, sondern repliziert, damit der Auth-Layer
// keine Runtime-Abhängigkeit auf ein anderes Foundation-Package bekommt. Parität
// ist durch Tests in beiden Packages abgesichert.
//
// Contract:
//   required = dedup(pluginWide ∪ perTool)   (pluginWide ist der harte Floor)
//   caller erfüllt jeden required-scope; ein caller-scope endend auf '.*' ist
//   ein Wildcard: prefix = scope ohne '.*'; matcht R gdw. R === prefix ODER
//   R.startsWith(prefix + '.'). Wildcards gelten NUR für caller-scopes;
//   required-scopes sind literal.
//
// GRENZE (v8-corp ruling #5206 noch offen): dieser Check liest AUSSCHLIESSLICH
// `claims.scopes` + manifest-`scopes_required`. KEIN actor_class / tenant_id /
// user_id für Allow/Deny — Cross-Tenant/Impersonation-Authz ist NICHT hier.

import type { PluginManifest, PluginMcpToolEntry } from '../types.js'

export interface ScopeCheckResult {
  /** true gdw. missing.length === 0 */
  ok: boolean
  /** deduped union (pluginWide zuerst, dann perTool), insertion-order */
  required: string[]
  /** required-scopes die der caller NICHT hat, in required-order */
  missing: string[]
}

/** True gdw. `callerScopes` den einzelnen literalen `required`-scope erfüllt. */
function callerHasScope(callerScopes: readonly string[], required: string): boolean {
  for (const cs of callerScopes) {
    if (cs === required) return true
    if (cs.endsWith('.*')) {
      const prefix = cs.slice(0, -2) // 'mcp.plugin.*' → 'mcp.plugin'
      if (required === prefix || required.startsWith(prefix + '.')) return true
    }
  }
  return false
}

/** scopes_required des per-Namen gematchten mcp_tools-Eintrags (string|object union). */
function perToolScopes(toolName: string, entries: readonly PluginMcpToolEntry[]): string[] {
  for (const e of entries) {
    if (typeof e === 'string') {
      if (e === toolName) return [] // string-Form trägt keine per-tool scopes
    } else if (e.name === toolName) {
      return e.scopes_required ?? []
    }
  }
  return [] // Tool nicht im Manifest deklariert → keine per-tool scopes
}

/**
 * Berechnet required = dedup(plugin-wide ∪ per-tool) und prüft, ob der caller
 * alle erfüllt. Reine Funktion — kein Throw, kein I/O.
 */
export function checkToolScopes(
  manifest: PluginManifest,
  toolName: string,
  callerScopes: readonly string[],
): ScopeCheckResult {
  const pluginWide = manifest.provides.scopes_required ?? []
  const perTool = perToolScopes(toolName, manifest.provides.mcp_tools)

  const required: string[] = []
  const seen = new Set<string>()
  for (const s of [...pluginWide, ...perTool]) {
    if (!seen.has(s)) {
      seen.add(s)
      required.push(s)
    }
  }

  const caller = callerScopes ?? []
  const missing = required.filter((r) => !callerHasScope(caller, r))
  return { ok: missing.length === 0, required, missing }
}

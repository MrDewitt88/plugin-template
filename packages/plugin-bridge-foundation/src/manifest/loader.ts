// Manifest-Loader: parse YAML/JSON + Zod-validate. Plugin-Provider hostet
// manifest.yaml im eigenen Repo; Foundation lädt + validiert vor Bridge-
// Start.

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { PluginManifestSchema, type PluginManifest } from '../types.js'

function defaultWarn(msg: string): void {
  if (typeof process !== 'undefined') process.stderr.write(`⚠️  ${msg}\n`)
}

export class ManifestError extends Error {
  constructor(
    public readonly code: 'not_found' | 'parse_error' | 'validation_error' | 'drift_203',
    message: string,
  ) {
    super(message)
    this.name = 'ManifestError'
  }
}

export type Drift203Mode = 'warn' | 'strict' | 'off'

export interface ManifestValidationOptions {
  /**
   * Drift #203 — service_endpoint MUSS 127.0.0.1 sein, NIE localhost. Modes:
   *  - 'warn' (default): emit warning to stderr, accept manifest
   *  - 'strict': throw ManifestError with code 'drift_203'
   *  - 'off': skip check
   */
  drift203?: Drift203Mode
  /** Override stderr-sink (für tests). */
  warn?: (msg: string) => void
}

// v0.2.1 — three loopback-Varianten gleichbehandelt (plug-elec msg #303).
// V8 bindet `[::1]:3100` per default, manche Hosts nur IPv6, andere nur IPv4 —
// alle drei sind aus remote-host-Sicht non-routable. Cross-Repo-Pattern aligned
// mit ET-Mind packages/etmind-bridge/src/manifest-loader.ts.
const LOOPBACK_PATTERNS: ReadonlyArray<{ regex: RegExp; label: string }> = [
  { regex: /^https?:\/\/localhost(:\d+)?(\/|$)/i, label: 'localhost' },
  { regex: /^https?:\/\/127\.0\.0\.1(:\d+)?(\/|$)/, label: '127.0.0.1' },
  { regex: /^https?:\/\/\[::1\](:\d+)?(\/|$)/, label: '[::1]' },
]

function detectLoopback(endpoint: string): string | null {
  for (const p of LOOPBACK_PATTERNS) {
    if (p.regex.test(endpoint)) return p.label
  }
  return null
}

function applyDrift203Check(
  manifest: PluginManifest,
  opts: ManifestValidationOptions = {},
): void {
  const mode = opts.drift203 ?? 'warn'
  if (mode === 'off') return
  const ep = manifest.distribution.service_endpoint
  if (!ep) return
  const loopback = detectLoopback(ep)
  if (!loopback) return
  // 127.0.0.1 ist die kanonische Konvention. localhost + [::1] werden flagged.
  if (loopback === '127.0.0.1') return
  const msg =
    `manifest.distribution.service_endpoint '${ep}' uses '${loopback}' — ` +
    `Drift #203 mandates '127.0.0.1' (Browser-CSP treats loopback variants as different origins). ` +
    `Replace '${loopback}' with '127.0.0.1'.`
  if (mode === 'strict') {
    throw new ManifestError('drift_203', msg)
  }
  // 'warn' mode
  const warn = opts.warn ?? defaultWarn
  warn(msg)
}

/**
 * Lädt manifest.yaml von disk + parsed + validates. Returnt typed manifest.
 * Wirft ManifestError bei Fehlern.
 */
export async function loadManifest(
  filePath: string,
  opts: ManifestValidationOptions = {},
): Promise<PluginManifest> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    throw new ManifestError('not_found', `manifest not found at: ${filePath}`)
  }

  let parsed: unknown
  try {
    parsed = parseYaml(raw)
  } catch (err) {
    throw new ManifestError('parse_error', `YAML parse failed: ${(err as Error).message}`)
  }

  const result = PluginManifestSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    throw new ManifestError('validation_error', `manifest validation failed: ${issues}`)
  }

  applyDrift203Check(result.data, opts)
  return result.data
}

/**
 * Validate manifest-Object ohne file-IO (für tests + in-memory-builders).
 */
export function validateManifest(
  value: unknown,
  opts: ManifestValidationOptions = {},
): PluginManifest {
  const result = PluginManifestSchema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    throw new ManifestError('validation_error', `manifest validation failed: ${issues}`)
  }
  applyDrift203Check(result.data, opts)
  return result.data
}

// --- Manifest-Discovery: manifest.<id>.yaml (CODEX-REV §13.8) ---
//
// Kanonischer Discovery-Dateiname ist `manifest.<plugin-id>.yaml` — der Suffix
// MUSS der validierten manifest.id entsprechen (Anti-Collision-Guard im globalen
// ~/Documents/Theseus/Plugins/-Ordner, wo mehrere Plugin-Manifeste nebeneinander
// liegen). Der bare `manifest.yaml` bleibt für eine Übergangsphase (≥2 Releases)
// als DEPRECATED-Fallback lesbar. Dual-read wie beim public_key_pem/public_key-
// Drift-Fix. Ratifiziert: agent #6044 (Frage A). loadManifest(path) bleibt der
// low-level file-path-Loader (unverändert).

/** Kanonischer Discovery-Dateiname für eine plugin-id. */
export function manifestFilename(id: string): string {
  return `manifest.${id}.yaml`
}

// manifest.<id>.yaml — <id> folgt derselben kebab-case-Regel wie PluginManifest.id.
const SUFFIXED_MANIFEST_RE = /^manifest\.([a-z][a-z0-9-]*[a-z0-9])\.yaml$/
const BARE_MANIFEST = 'manifest.yaml'

export interface DiscoveredManifest {
  manifest: PluginManifest
  /** Voller Pfad der geladenen Datei. */
  path: string
  /** Basename der geladenen Datei. */
  filename: string
  /** true, wenn aus dem DEPRECATED bare `manifest.yaml` geladen. */
  deprecated: boolean
}

/**
 * Discover + load a plugin manifest from a DIRECTORY (CODEX-REV §13.8).
 *
 * Precedence:
 *  1. `manifest.<id>.yaml` (canonical) — the filename suffix MUST equal the
 *     validated `manifest.id`, else `validation_error` (anti-collision guard).
 *  2. `manifest.yaml` (DEPRECATED) — loaded with a deprecation warning.
 *
 * Multiple distinct `manifest.<x>.yaml` in one dir → `validation_error`
 * (ambiguous). No manifest at all → `not_found`.
 */
export async function discoverManifest(
  dir: string,
  opts: ManifestValidationOptions = {},
): Promise<DiscoveredManifest> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    throw new ManifestError('not_found', `manifest directory not found: ${dir}`)
  }

  const suffixed = entries.filter((f) => SUFFIXED_MANIFEST_RE.test(f)).sort()

  if (suffixed.length > 1) {
    throw new ManifestError(
      'validation_error',
      `ambiguous manifest discovery in '${dir}': multiple suffixed manifests [${suffixed.join(', ')}] — exactly one 'manifest.<id>.yaml' allowed`,
    )
  }

  if (suffixed.length === 1) {
    const filename = suffixed[0]!
    const declaredId = SUFFIXED_MANIFEST_RE.exec(filename)![1]!
    const path = join(dir, filename)
    const manifest = await loadManifest(path, opts)
    if (manifest.id !== declaredId) {
      throw new ManifestError(
        'validation_error',
        `manifest filename/id mismatch: '${filename}' encodes id '${declaredId}' but manifest.id is '${manifest.id}' — the filename suffix MUST equal manifest.id (CODEX-REV §13)`,
      )
    }
    // A bare `manifest.yaml` alongside the canonical one is fine DURING migration
    // (same id). A *different* id means a stray file in the reserved
    // `manifest.*.yaml` namespace is shadowing the real bare manifest → ambiguous;
    // fail loudly rather than silently booting the stray plugin.
    if (entries.includes(BARE_MANIFEST)) {
      let bareId: string | null = null
      try {
        bareId = (await loadManifest(join(dir, BARE_MANIFEST), { drift203: 'off' })).id
      } catch {
        // bare manifest unparseable/invalid — ignore it; the suffixed one is canonical
      }
      if (bareId !== null && bareId !== manifest.id) {
        throw new ManifestError(
          'validation_error',
          `ambiguous manifest discovery in '${dir}': '${filename}' (id '${manifest.id}') and bare 'manifest.yaml' (id '${bareId}') declare different ids — remove the stray file from the reserved manifest.*.yaml namespace`,
        )
      }
    }
    return { manifest, path, filename, deprecated: false }
  }

  if (entries.includes(BARE_MANIFEST)) {
    const path = join(dir, BARE_MANIFEST)
    const manifest = await loadManifest(path, opts)
    const warn = opts.warn ?? defaultWarn
    warn(
      `manifest discovered as bare '${BARE_MANIFEST}' in '${dir}' — DEPRECATED (CODEX-REV §13.8). ` +
        `Rename to '${manifestFilename(manifest.id)}' (filename suffix = manifest.id); ` +
        `bare-manifest support is removed after the transition window.`,
    )
    return { manifest, path, filename: BARE_MANIFEST, deprecated: true }
  }

  throw new ManifestError(
    'not_found',
    `no manifest found in '${dir}' (expected 'manifest.<id>.yaml' or, deprecated, 'manifest.yaml')`,
  )
}

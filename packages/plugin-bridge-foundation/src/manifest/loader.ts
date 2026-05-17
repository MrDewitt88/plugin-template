// Manifest-Loader: parse YAML/JSON + Zod-validate. Plugin-Provider hostet
// manifest.yaml im eigenen Repo; Foundation lädt + validiert vor Bridge-
// Start.

import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { PluginManifestSchema, type PluginManifest } from '../types.js'

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
  const warn = opts.warn ?? ((s: string) => {
    if (typeof process !== 'undefined') process.stderr.write(`⚠️  ${s}\n`)
  })
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

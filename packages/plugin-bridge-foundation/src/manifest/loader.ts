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

const DRIFT_203_PATTERN = /^https?:\/\/localhost(:|\/|$)/i

function applyDrift203Check(
  manifest: PluginManifest,
  opts: ManifestValidationOptions = {},
): void {
  const mode = opts.drift203 ?? 'warn'
  if (mode === 'off') return
  const ep = manifest.distribution.service_endpoint
  if (!ep || !DRIFT_203_PATTERN.test(ep)) return
  const msg =
    `manifest.distribution.service_endpoint '${ep}' uses 'localhost' — ` +
    `Drift #203 mandates '127.0.0.1' (Browser-CSP treats them as different origins). ` +
    `Replace 'localhost' with '127.0.0.1'.`
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

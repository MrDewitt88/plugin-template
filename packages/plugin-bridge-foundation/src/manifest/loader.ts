// Manifest-Loader: parse YAML/JSON + Zod-validate. Plugin-Provider hostet
// manifest.yaml im eigenen Repo; Foundation lädt + validiert vor Bridge-
// Start.

import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { PluginManifestSchema, type PluginManifest } from '../types.js'

export class ManifestError extends Error {
  constructor(
    public readonly code: 'not_found' | 'parse_error' | 'validation_error',
    message: string,
  ) {
    super(message)
    this.name = 'ManifestError'
  }
}

/**
 * Lädt manifest.yaml von disk + parsed + validates. Returnt typed manifest.
 * Wirft ManifestError bei Fehlern.
 */
export async function loadManifest(filePath: string): Promise<PluginManifest> {
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

  return result.data
}

/**
 * Validate manifest-Object ohne file-IO (für tests + in-memory-builders).
 */
export function validateManifest(value: unknown): PluginManifest {
  const result = PluginManifestSchema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    throw new ManifestError('validation_error', `manifest validation failed: ${issues}`)
  }
  return result.data
}

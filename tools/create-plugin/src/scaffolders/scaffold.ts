// Scaffolder — render templates + write to filesystem.

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMPLATE_FILES } from '../templates/files.js'
import { buildContext, render, type TemplateContext } from '../templates/render.js'

// Static (non-templated) files copied verbatim into the scaffold. The bundle
// packer is plugin-agnostic — no placeholders — so it ships as a static asset
// (single source of truth: templates-static/, also the tested reference).
// Path resolves identically from src/scaffolders (tests) and dist/scaffolders
// (published) — both are one level under the package root.
const STATIC_DIR = fileURLToPath(new URL('../../templates-static/', import.meta.url))
const STATIC_FILES: ReadonlyArray<{ src: string; dest: string }> = [
  { src: 'pack-bundle.mjs', dest: 'scripts/pack-bundle.mjs' },
]

export class ScaffoldError extends Error {
  constructor(
    public readonly code: 'target_exists' | 'write_failed' | 'invalid_target',
    message: string,
  ) {
    super(message)
    this.name = 'ScaffoldError'
  }
}

export interface ScaffoldOptions {
  pluginName: string
  hosts: string[]
  features: string[]
  target: string
  /** Default false — wirft wenn target-dir bereits existiert. */
  force?: boolean
}

export interface ScaffoldResult {
  filesWritten: string[]
  target: string
  context: TemplateContext
}

/**
 * Render alle templates + write files. Returns liste der geschriebenen
 * Files für summary.
 *
 * Skipt files mit feature-flag wenn feature nicht in opts.features.
 */
export function scaffold(opts: ScaffoldOptions): ScaffoldResult {
  const target = resolve(opts.target)
  if (existsSync(target) && !opts.force) {
    throw new ScaffoldError(
      'target_exists',
      `target dir already exists: ${target} (use --force to overwrite)`,
    )
  }

  const context = buildContext({
    pluginName: opts.pluginName,
    hosts: opts.hosts,
    features: opts.features,
  })

  const written: string[] = []

  for (const file of TEMPLATE_FILES) {
    if (file.feature && !opts.features.includes(file.feature)) continue

    const renderedPath = render(file.path, context)
    const renderedContent = render(file.content, context)
    const fullPath = join(target, renderedPath)

    try {
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, renderedContent, 'utf-8')
      written.push(renderedPath)
    } catch (err) {
      throw new ScaffoldError(
        'write_failed',
        `failed to write ${fullPath}: ${(err as Error).message}`,
      )
    }
  }

  // Static assets copied verbatim (no rendering).
  for (const sf of STATIC_FILES) {
    const fullPath = join(target, sf.dest)
    try {
      mkdirSync(dirname(fullPath), { recursive: true })
      copyFileSync(join(STATIC_DIR, sf.src), fullPath)
      written.push(sf.dest)
    } catch (err) {
      throw new ScaffoldError(
        'write_failed',
        `failed to copy static ${sf.src} → ${fullPath}: ${(err as Error).message}`,
      )
    }
  }

  return { filesWritten: written, target, context }
}

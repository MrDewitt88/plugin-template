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
  // `pnpm check` — findet Manifest + Endpunkt selbst und ruft den Runner auf.
  // Existiert, weil Reibung entscheidet, ob gemessen wird: bei der ersten
  // Bestandsaufnahme hatten 20 Plugins den Runner und ZWEI hatten ihn laufen
  // lassen. Ebenfalls plugin-agnostisch, also statisch statt Template.
  { src: 'check.mjs', dest: 'scripts/check.mjs' },
  // withPublicHealth — macht /health tokenfrei, ohne die Foundation zu tauschen.
  // Gebraucht von jedem, der auf plugin-bridge-foundation 0.12.0–0.18.x sitzt:
  // dort liegt die Health-Route hinter auth(), und der Host haelt den laufenden
  // Dienst dauerhaft fuer "nicht bereit". Behoben ab 0.19.0 — aber solange die
  // nicht auf npm liegt, ist der Wrapper der Weg. Bewusst abhaengigkeitsfrei
  // und kopierbar, damit ihn auch Plugins mit EIGENER Bridge uebernehmen
  // koennen: der Fehler wird nicht geerbt, sondern nachgebaut.
  { src: 'public-health.mjs', dest: 'src/public-health.mjs' },
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

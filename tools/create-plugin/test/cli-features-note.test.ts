// End-to-end-Tests des gebauten CLI (bin/cli.js) für das features-note-Subcommand.
// Bewusst als Prozess-Spawn: stdout/stderr-Trennung, Exit-Codes und das
// Pipe-Flush-Verhalten lassen sich nur am echten Binary prüfen — genau dort
// saßen die Bugs (silent 64-KiB-Truncation, `--out datei` → ./true).

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(PKG_ROOT, 'bin', 'cli.js')

function manifest(id: string, toolCount = 1): string {
  const tools = Array.from({ length: toolCount }, (_, i) =>
    `    - name: ns.tool_${i}\n      description: Tool number ${i} for the catalogue.\n      scopes_required: [mcp.read.x]`,
  ).join('\n')
  return `id: ${id}
name:
  de: T
  en: T
description:
  de: T
  en: T
version: 1.0.0
distribution:
  type: external-service
  service_endpoint: http://127.0.0.1:3600
compatibility:
  apps: [teammind]
  min_app_version: 1.0.0
provides:
  routes: []
  module_extensions: []
  scopes_required: []
  mcp_tools:
${tools}
`
}

function run(dir: string, args: string[]) {
  const r = spawnSync('node', [CLI, 'features-note', ...args], { cwd: dir, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

describe('create-plugin features-note (CLI)', () => {
  // Fixture liegt INNERHALB des Pakets, damit `loadFoundation` bridge-foundation
  // über die normale Node-Auflösung nach oben findet (wie in einem Plugin-Repo).
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(PKG_ROOT, '.test-fn-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writes clean markdown to stdout and nothing else', () => {
    writeFileSync(join(dir, 'manifest.demo.yaml'), manifest('demo'))
    const r = run(dir, [])
    expect(r.status).toBe(0)
    expect(r.stderr).toBe('')
    expect(r.stdout.startsWith('# demo — Feature-Inventar')).toBe(true)
    expect(r.stdout).toContain('`manifest.demo.yaml`')
  })

  it('does NOT truncate large output through a pipe (64 KiB regression)', () => {
    // Muss die Pipe-Puffergröße (64 KiB) sicher überschreiten, sonst wäre der
    // Test kein Wächter gegen die Truncation-Regression.
    writeFileSync(join(dir, 'manifest.big.yaml'), manifest('big', 1400))
    const piped = run(dir, [])
    expect(piped.status).toBe(0)
    // Gegenprobe über eine Datei: identische Bytes, nichts abgeschnitten.
    const outFile = join(dir, 'ref.md')
    expect(run(dir, [`--out=${outFile}`]).status).toBe(0)
    const viaFile = readFileSync(outFile, 'utf-8')
    expect(piped.stdout.length).toBe(viaFile.length)
    expect(piped.stdout).toBe(viaFile)
    expect(viaFile.length).toBeGreaterThan(65536)
  })

  it('accepts the space-separated flag form (--out datei), not just --out=', () => {
    writeFileSync(join(dir, 'manifest.demo.yaml'), manifest('demo'))
    const target = join(dir, 'features.md')
    const r = run(dir, ['--out', target])
    expect(r.status).toBe(0)
    expect(readFileSync(target, 'utf-8')).toContain('# demo — Feature-Inventar')
    // Der frühere Bug legte stattdessen eine Datei namens "true" im cwd an.
    expect(() => readFileSync(join(dir, 'true'), 'utf-8')).toThrow()
  })

  it('rejects a value-less flag instead of silently using "true"', () => {
    writeFileSync(join(dir, 'manifest.demo.yaml'), manifest('demo'))
    const r = run(dir, ['--out'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('--out')
  })

  it('reports an unwritable --out as error/exit 1, not a raw stack trace', () => {
    writeFileSync(join(dir, 'manifest.demo.yaml'), manifest('demo'))
    const r = run(dir, [`--out=${join(dir, 'does', 'not', 'exist.md')}`])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('error:')
    expect(r.stderr).not.toContain('unexpected error')
  })

  it('reports a missing manifest as error/exit 1', () => {
    const r = run(dir, [])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('error:')
    expect(r.stdout).toBe('')
  })

  it('names the REAL source file and flags the deprecated bare manifest.yaml', () => {
    writeFileSync(join(dir, 'manifest.yaml'), manifest('legacy'))
    const r = run(dir, [])
    expect(r.status).toBe(0)
    // Provenienz muss die tatsächlich geladene Datei nennen …
    expect(r.stdout).toContain('Generiert aus `manifest.yaml`')
    expect(r.stdout).not.toContain('Generiert aus `manifest.legacy.yaml`')
    // … und den Deprecation-Hinweis tragen; die Warnung geht auf stderr.
    expect(r.stdout).toContain('DEPRECATED')
    expect(r.stderr).toContain('warning:')
  })

  it('fails clearly when bridge-foundation is not resolvable from --dir', () => {
    const outside = mkdtempSync(join(tmpdir(), 'no-foundation-'))
    try {
      mkdirSync(join(outside, 'sub'), { recursive: true })
      writeFileSync(join(outside, 'manifest.demo.yaml'), manifest('demo'))
      // NODE_PATH leeren: der Test prüft die Auflösung AUS DEM ZIELVERZEICHNIS.
      // Der Test-Runner injiziert sonst einen ambienten Pfad, über den
      // bridge-foundation doch gefunden würde.
      const r = spawnSync('node', [CLI, 'features-note', `--dir=${outside}`], {
        cwd: outside,
        encoding: 'utf8',
        env: { ...process.env, NODE_PATH: '' },
      })
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('plugin-bridge-foundation')
      expect(r.stdout ?? '').toBe('')
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

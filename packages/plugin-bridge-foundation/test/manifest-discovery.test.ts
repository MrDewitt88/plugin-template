import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  discoverManifest,
  manifestFilename,
  ManifestError,
} from '../src/manifest/loader.js'

function manifestYaml(id: string, endpoint = 'http://127.0.0.1:3600'): string {
  return `id: ${id}
name:
  de: Test
  en: Test
description:
  de: Test
  en: Test
version: 0.1.0
distribution:
  type: external-service
  service_endpoint: ${endpoint}
compatibility:
  apps: [teammind]
  min_app_version: 0.5.0
provides:
  routes: []
  mcp_tools: []
  module_extensions: []
  scopes_required: []
`
}

describe('discoverManifest — dual-read manifest.<id>.yaml (CODEX-REV §13.8)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'manifest-discovery-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('manifestFilename() encodes manifest.<id>.yaml', () => {
    expect(manifestFilename('cad2d-mind')).toBe('manifest.cad2d-mind.yaml')
  })

  it('discovers the canonical manifest.<id>.yaml (deprecated=false, no warn)', async () => {
    await writeFile(join(dir, 'manifest.cad2d-mind.yaml'), manifestYaml('cad2d-mind'))
    const warn = vi.fn()
    const got = await discoverManifest(dir, { warn })
    expect(got.manifest.id).toBe('cad2d-mind')
    expect(got.filename).toBe('manifest.cad2d-mind.yaml')
    expect(got.deprecated).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('rejects filename/id mismatch (anti-collision guard)', async () => {
    // filename encodes 'wrong-id' but manifest.id is 'right-id'
    await writeFile(join(dir, 'manifest.wrong-id.yaml'), manifestYaml('right-id'))
    await expect(discoverManifest(dir)).rejects.toMatchObject({
      name: 'ManifestError',
      code: 'validation_error',
    })
  })

  // v0.17.0 — Verhaltensumkehr, mit Absicht. Hier wurde eine Deprecation-Warnung
  // festgeschrieben, die zum Umbenennen auf `manifest.<id>.yaml` aufforderte.
  // Gemessen an allen drei Hosts war das falsch herum: myMind liest beide Formen,
  // TeamMind und FamilyMind lesen AUSSCHLIESSLICH `<plugin-id>/manifest.yaml`.
  // Wer der Warnung folgte, machte sein Plugin bei zwei von drei Hosts
  // unsichtbar — ohne Fehler, ohne Katalogeintrag.
  it('bare manifest.yaml ist kanonisch — keine Warnung, deprecated=false', async () => {
    await writeFile(join(dir, 'manifest.yaml'), manifestYaml('legacy-plugin'))
    const warn = vi.fn()
    const got = await discoverManifest(dir, { warn })
    expect(got.manifest.id).toBe('legacy-plugin')
    expect(got.filename).toBe('manifest.yaml')
    expect(got.deprecated).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('expectDirId: Verzeichnisname ungleich manifest.id → Fehler (Host-Modus)', async () => {
    // `dir` ist ein tmp-Verzeichnis mit Zufallsnamen, also nie gleich der id.
    await writeFile(join(dir, 'manifest.yaml'), manifestYaml('right-id'))
    await expect(discoverManifest(dir, { expectDirId: true })).rejects.toMatchObject({
      name: 'ManifestError',
      code: 'validation_error',
    })
  })

  it('expectDirId bleibt aus für Plugins, die ihr eigenes Manifest lesen', async () => {
    // Ein Plugin liest aus seinem Repo-Root; das Verzeichnis heisst dort nach dem
    // Repo, nicht nach der Kennung. Ohne die Option darf das nicht stoeren.
    await writeFile(join(dir, 'manifest.yaml'), manifestYaml('right-id'))
    const got = await discoverManifest(dir)
    expect(got.manifest.id).toBe('right-id')
  })

  it('migration state: suffixed + bare with the SAME id → prefers suffixed, no error', async () => {
    // The bare manifest.yaml is the OLD copy of the same plugin during migration.
    await writeFile(join(dir, 'manifest.new-plugin.yaml'), manifestYaml('new-plugin'))
    await writeFile(join(dir, 'manifest.yaml'), manifestYaml('new-plugin'))
    const got = await discoverManifest(dir)
    expect(got.manifest.id).toBe('new-plugin')
    expect(got.filename).toBe('manifest.new-plugin.yaml')
    expect(got.deprecated).toBe(false)
  })

  it('rejects a stray suffixed manifest shadowing a bare manifest with a DIFFERENT id', async () => {
    // manifest.example.yaml (id 'example', its own suffix matches) is a stray file
    // sitting next to the plugin's real bare manifest.yaml (id 'real-plugin').
    // Without the guard this would silently boot the wrong plugin.
    await writeFile(join(dir, 'manifest.example.yaml'), manifestYaml('example'))
    await writeFile(join(dir, 'manifest.yaml'), manifestYaml('real-plugin'))
    await expect(discoverManifest(dir)).rejects.toMatchObject({
      name: 'ManifestError',
      code: 'validation_error',
    })
  })

  it('rejects ambiguous discovery (two distinct suffixed manifests)', async () => {
    await writeFile(join(dir, 'manifest.plugin-a.yaml'), manifestYaml('plugin-a'))
    await writeFile(join(dir, 'manifest.plugin-b.yaml'), manifestYaml('plugin-b'))
    await expect(discoverManifest(dir)).rejects.toMatchObject({
      name: 'ManifestError',
      code: 'validation_error',
    })
  })

  it('throws not_found when the directory has no manifest', async () => {
    await expect(discoverManifest(dir)).rejects.toMatchObject({
      name: 'ManifestError',
      code: 'not_found',
    })
  })

  it('throws not_found when the directory does not exist', async () => {
    await expect(discoverManifest(join(dir, 'nope'))).rejects.toMatchObject({
      name: 'ManifestError',
      code: 'not_found',
    })
  })

  it('propagates validation_error from a malformed manifest.<id>.yaml', async () => {
    await writeFile(join(dir, 'manifest.broken.yaml'), 'id: broken\nversion: 0.1.0\n')
    await expect(discoverManifest(dir, { drift203: 'off' })).rejects.toMatchObject({
      name: 'ManifestError',
      code: 'validation_error',
    })
    expect(ManifestError).toBeDefined()
  })
})

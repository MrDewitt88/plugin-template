import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensurePaths, resolvePaths } from '../src/fs/multi-host-paths.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plugin-storage-foundation-paths-test-'))
})

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('resolvePaths', () => {
  it('liefert standard-Sub-Paths', () => {
    const paths = resolvePaths({
      storageRoot: tmpDir,
      pluginId: 'markview',
      hostId: 'teammind',
      tenantId: '00000000-0000-4000-8000-000000000001',
    })
    expect(paths.tenantRoot).toBe(
      join(tmpDir, 'markview', 'teammind', '00000000-0000-4000-8000-000000000001'),
    )
    expect(paths.dbPath).toBe(join(paths.tenantRoot, 'db.sqlite'))
    expect(paths.documentsDir).toBe(join(paths.tenantRoot, 'documents'))
    expect(paths.versionsDir).toBe(join(paths.tenantRoot, 'versions'))
  })

  it('subPath() liefert deeper paths', () => {
    const paths = resolvePaths({
      storageRoot: tmpDir,
      pluginId: 'markview',
      hostId: 'teammind',
      tenantId: 't1',
    })
    expect(paths.subPath('exports', 'pdf')).toBe(join(paths.tenantRoot, 'exports', 'pdf'))
  })

  it('rejected segment mit `..` (path-traversal)', () => {
    expect(() =>
      resolvePaths({
        storageRoot: tmpDir,
        pluginId: '../etc',
        hostId: 'h',
        tenantId: 't',
      }),
    ).toThrow(/cannot contain/)
  })

  it('rejected segment mit `/` (absolute-path-attempt)', () => {
    expect(() =>
      resolvePaths({
        storageRoot: tmpDir,
        pluginId: 'a/b',
        hostId: 'h',
        tenantId: 't',
      }),
    ).toThrow(/cannot contain/)
  })

  it('rejected hidden-file-segments (start with `.`)', () => {
    expect(() =>
      resolvePaths({
        storageRoot: tmpDir,
        pluginId: '.hidden',
        hostId: 'h',
        tenantId: 't',
      }),
    ).toThrow(/cannot start with/)
  })

  it('subPath() rejected bad segments', () => {
    const paths = resolvePaths({
      storageRoot: tmpDir,
      pluginId: 'p',
      hostId: 'h',
      tenantId: 't',
    })
    expect(() => paths.subPath('..', 'evil')).toThrow(/cannot contain/)
  })
})

describe('ensurePaths', () => {
  it('creates tenantRoot + documents + versions dirs', () => {
    const paths = resolvePaths({
      storageRoot: tmpDir,
      pluginId: 'markview',
      hostId: 'teammind',
      tenantId: 't1',
    })
    ensurePaths(paths)
    expect(existsSync(paths.tenantRoot)).toBe(true)
    expect(existsSync(paths.documentsDir)).toBe(true)
    expect(existsSync(paths.versionsDir)).toBe(true)
  })

  it('idempotent — second call ist no-op', () => {
    const paths = resolvePaths({
      storageRoot: tmpDir,
      pluginId: 'markview',
      hostId: 'teammind',
      tenantId: 't1',
    })
    ensurePaths(paths)
    expect(() => ensurePaths(paths)).not.toThrow()
  })
})

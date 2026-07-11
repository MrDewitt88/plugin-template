#!/usr/bin/env node
// Deterministic plugin bundle packer — zero-dep (Node builtins only).
//
// Produces a reproducible `bundle.tgz` + `bundle.meta.json` for Nexus-catalog
// distribution. Ratified: agent #6044 (plugin-rollout).
//   • Layout: manifest.<id>.yaml + server/ + dist-plugin/ — NO node_modules,
//     NO runtime (the host provides the signed Bun runtime, G1).
//   • Integrity anchor v1 = sha256 (the catalog is the trust channel). The meta
//     reserves `signature: null` so an Ed25519 bundle-signature stays additive (v2).
//   • Determinism: USTAR entries sorted by path, mtime=0, uid/gid=0, empty owner
//     names, mode 0644; gzip level 9. Reproducible within one Node/zlib toolchain.
//
// Run from the plugin root:  node scripts/pack-bundle.mjs [--out bundle.tgz] [--meta bundle.meta.json]

import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

const ROOT = process.cwd()
const OUT = argValue('--out') || 'bundle.tgz'
const META_OUT = argValue('--meta') || 'bundle.meta.json'

// Directories whose contents ship in the bundle (skipped silently if absent).
const INCLUDE_DIRS = ['server', 'dist-plugin']

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : null
}

const SUFFIXED = /^manifest\.([a-z][a-z0-9-]*[a-z0-9])\.yaml$/

async function findManifest() {
  const entries = await readdir(ROOT)
  const suffixed = entries.filter((f) => SUFFIXED.test(f)).sort()
  if (suffixed.length > 1) {
    throw new Error('ambiguous: multiple manifest.<id>.yaml files: ' + suffixed.join(', '))
  }
  if (suffixed.length === 1) {
    const name = suffixed[0]
    return { name, suffixId: SUFFIXED.exec(name)[1] }
  }
  if (entries.includes('manifest.yaml')) {
    process.stderr.write('WARN: using deprecated bare manifest.yaml — rename to manifest.<id>.yaml\n')
    return { name: 'manifest.yaml', suffixId: null }
  }
  throw new Error('no manifest found (expected manifest.<id>.yaml or manifest.yaml)')
}

function field(yaml, re, name) {
  const m = yaml.match(re)
  if (!m) throw new Error('manifest missing required field: ' + name)
  return m[1].replace(/^["']|["']$/g, '')
}

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (e.isFile()) out.push(p)
    else if (e.isSymbolicLink()) {
      // Do NOT silently drop symlinked build artifacts (that would ship an
      // incomplete bundle under a valid sha256). Warn loudly; never follow the
      // link (avoids packing files outside the plugin root).
      process.stderr.write(
        'WARN: skipping symlink ' +
          relative(ROOT, p) +
          ' — materialize it as a real file to include it in the bundle\n',
      )
    }
  }
  return out
}

async function collectFiles(manifestName) {
  const files = [manifestName]
  for (const dir of INCLUDE_DIRS) {
    let st
    try {
      st = await stat(join(ROOT, dir))
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    for (const f of await walk(join(ROOT, dir))) files.push(relative(ROOT, f))
  }
  // POSIX-normalize separators + de-dup + sort → deterministic order.
  const posix = files.map((f) => f.split(sep).join('/'))
  return [...new Set(posix)].sort()
}

// --- Launch-Contract (agent #6046 ruling) ---
//
// Optional author-authored `bundle.launch.json` at the plugin root → validated
// and embedded as `bundle.meta.json.launch`. The host spawns `<host-bun> <entry>`
// with cwd inside the extracted bundle and always sets PLUGIN_BRIDGE_PORT. If the
// file is absent the host applies the convention `entry: server/index.js`.
const LAUNCH_FILE = 'bundle.launch.json'
const LAUNCH_KEYS = new Set(['entry', 'cwd', 'env', 'health_path'])

// A bundle-relative path: non-empty string, not absolute, no `..` traversal.
function badPath(p) {
  return typeof p !== 'string' || p.length === 0 || p.startsWith('/') || p.split('/').includes('..')
}

async function readLaunch(packedFiles) {
  let raw
  try {
    raw = await readFile(join(ROOT, LAUNCH_FILE), 'utf8')
  } catch {
    return null // no launch config — host applies the default convention
  }
  let launch
  try {
    launch = JSON.parse(raw)
  } catch (e) {
    throw new Error(LAUNCH_FILE + ': invalid JSON — ' + e.message)
  }
  if (typeof launch !== 'object' || launch === null || Array.isArray(launch)) {
    throw new Error(LAUNCH_FILE + ': must be a JSON object')
  }
  for (const k of Object.keys(launch)) {
    if (!LAUNCH_KEYS.has(k)) {
      throw new Error(LAUNCH_FILE + ": unknown key '" + k + "' (allowed: entry, cwd, env, health_path)")
    }
  }
  // entry — REQUIRED: a relative .js path that is actually IN the bundle.
  if (badPath(launch.entry) || !launch.entry.endsWith('.js')) {
    throw new Error(LAUNCH_FILE + ": 'entry' must be a relative .js path inside the bundle (no absolute, no '..')")
  }
  if (!packedFiles.includes(launch.entry)) {
    throw new Error(
      LAUNCH_FILE + ": 'entry' '" + launch.entry + "' is not in the bundle — packed files: " + packedFiles.join(', '),
    )
  }
  // cwd — optional, bundle-relative (".", "server", …).
  if (launch.cwd !== undefined && badPath(launch.cwd)) {
    throw new Error(LAUNCH_FILE + ": 'cwd' must be a relative path inside the bundle")
  }
  // env — optional flat string→string map (static; NEVER secrets).
  if (launch.env !== undefined) {
    if (typeof launch.env !== 'object' || launch.env === null || Array.isArray(launch.env)) {
      throw new Error(LAUNCH_FILE + ": 'env' must be a JSON object of string values")
    }
    for (const [k, v] of Object.entries(launch.env)) {
      if (typeof v !== 'string') throw new Error(LAUNCH_FILE + ": env['" + k + "'] must be a string")
    }
  }
  // health_path — optional absolute request path.
  if (launch.health_path !== undefined && (typeof launch.health_path !== 'string' || !launch.health_path.startsWith('/'))) {
    throw new Error(LAUNCH_FILE + ": 'health_path' must be a string starting with '/'")
  }
  return launch
}

// --- USTAR (tar) ---

function octal(n, len) {
  return n.toString(8).padStart(len - 1, '0') + '\0'
}

function tarHeader(name, size) {
  const buf = Buffer.alloc(512, 0)
  let prefix = ''
  let fname = name
  if (Buffer.byteLength(name) > 100) {
    let cut = -1
    for (let i = 0; i < name.length; i++) {
      if (
        name[i] === '/' &&
        Buffer.byteLength(name.slice(i + 1)) <= 100 &&
        Buffer.byteLength(name.slice(0, i)) <= 155
      ) {
        cut = i
        break
      }
    }
    if (cut < 0) throw new Error('path too long for USTAR: ' + name)
    prefix = name.slice(0, cut)
    fname = name.slice(cut + 1)
  }
  buf.write(fname, 0, 100, 'utf8')
  buf.write(octal(0o644, 8), 100, 8, 'ascii') // mode
  buf.write(octal(0, 8), 108, 8, 'ascii') // uid
  buf.write(octal(0, 8), 116, 8, 'ascii') // gid
  buf.write(octal(size, 12), 124, 12, 'ascii') // size
  buf.write(octal(0, 12), 136, 12, 'ascii') // mtime = 0 (deterministic)
  buf.write('        ', 148, 8, 'ascii') // chksum placeholder (8 spaces)
  buf.write('0', 156, 1, 'ascii') // typeflag = regular file
  buf.write('ustar\0', 257, 6, 'ascii') // magic
  buf.write('00', 263, 2, 'ascii') // version
  if (prefix) buf.write(prefix, 345, 155, 'utf8')
  let sum = 0
  for (let i = 0; i < 512; i++) sum += buf[i]
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii')
  return buf
}

async function main() {
  const { name: manifestName, suffixId } = await findManifest()
  // Strip a leading UTF-8 BOM (YAML-spec-permitted; the runtime yaml parser
  // strips it too) so the top-level field regexes still anchor on line 1.
  const manifestRaw = (await readFile(join(ROOT, manifestName), 'utf8')).replace(/^\uFEFF/, '')
  const id = field(manifestRaw, /^id:[ \t]+(\S+)/m, 'id')
  // Mirror the runtime's ratified anti-collision guard: fail at PACK time (not at
  // install) if the filename suffix and manifest.id disagree, so a DOA bundle the
  // host would reject can never pass with exit 0.
  if (suffixId !== null && suffixId !== id) {
    throw new Error(
      "manifest filename/id mismatch: '" +
        manifestName +
        "' declares id '" +
        id +
        "' — rename the file to manifest." +
        id +
        ".yaml (filename suffix must equal manifest.id)",
    )
  }
  const version = field(manifestRaw, /^version:[ \t]+(\S+)/m, 'version')
  const mav = manifestRaw.match(/^[ \t]+min_app_version:[ \t]+(\S+)/m)
  const minAppVersion = mav ? mav[1].replace(/^["']|["']$/g, '') : null

  const files = await collectFiles(manifestName)
  if (files.length === 1) {
    process.stderr.write(
      'WARN: only the manifest is being packed — no server/ or dist-plugin/ build output found\n',
    )
  }
  const launch = await readLaunch(files)

  const chunks = []
  for (const rel of files) {
    const data = await readFile(join(ROOT, rel))
    chunks.push(tarHeader(rel, data.length))
    chunks.push(data)
    const pad = (512 - (data.length % 512)) % 512
    if (pad) chunks.push(Buffer.alloc(pad, 0))
  }
  chunks.push(Buffer.alloc(1024, 0)) // two zero blocks = archive EOF
  const tar = Buffer.concat(chunks)
  const tgz = gzipSync(tar, { level: 9 })
  await writeFile(OUT, tgz)

  const sha256 = createHash('sha256').update(tgz).digest('hex')
  const meta = {
    id,
    version,
    min_app_version: minAppVersion,
    sha256,
    bytes: tgz.length,
    signature: null, // reserved for v2 Ed25519 bundle-signature (agent #6044/B)
    ...(launch ? { launch } : {}), // optional launch-contract (agent #6046)
    files,
  }
  await writeFile(META_OUT, JSON.stringify(meta, null, 2) + '\n')
  process.stdout.write(JSON.stringify(meta, null, 2) + '\n')
}

main().catch((err) => {
  process.stderr.write('pack-bundle failed: ' + err.message + '\n')
  process.exit(1)
})

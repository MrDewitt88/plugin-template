#!/usr/bin/env node
/**
 * pnpm check — misst dieses Plugin gegen den Konformitäts-Vertrag.
 *
 * Sucht das Manifest, liest den Endpunkt daraus, prüft ob der Dienst läuft und
 * ruft den Konformitäts-Runner auf. Der Runner selbst liegt NICHT hier: er
 * gehört dem Host, prüft den Vertrag den der Host tatsächlich fährt, und wäre
 * als Kopie in zwei Wochen eine zweite Wahrheit.
 *
 * Warum dieses Skript überhaupt existiert: bei der ersten Bestandsaufnahme im
 * Cluster hatten 20 Plugins den Runner, und ZWEI hatten ihn laufen lassen. Nicht
 * aus Unwillen — Manifest finden, Endpunkt heraussuchen, Flags richtig setzen
 * war jedes Mal Handarbeit. Reibung entscheidet, ob gemessen wird.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = process.cwd()

// ── Manifest finden ────────────────────────────────────────────────────────
// Kanonisch ist das bare `manifest.yaml` (ausgeliefert unter <plugin-id>/).
// `manifest.<id>.yaml` findet nur myMind, TeamMind und FamilyMind nicht.
const entries = readdirSync(root)
const suffixed = entries.filter((f) => /^manifest\.[a-z][a-z0-9-]*\.yaml$/.test(f)).sort()
const manifestFile = existsSync(join(root, 'manifest.yaml'))
  ? 'manifest.yaml'
  : suffixed[0]

if (!manifestFile) {
  console.error('✗ Kein Manifest im Projektwurzel gefunden.')
  console.error('  Erwartet: manifest.yaml  (oder manifest.<id>.yaml)')
  console.error('  Ohne Manifest erscheint dein Plugin beim Kunden nie — ohne Fehlermeldung.')
  process.exit(2)
}

const manifestPath = join(root, manifestFile)
const raw = readFileSync(manifestPath, 'utf8')

// Absichtlich kein YAML-Parser: dieses Skript soll ohne Abhängigkeiten laufen,
// auch bevor `pnpm install` durch ist. Der Runner parst richtig.
const endpoint = raw.match(/^\s*service_endpoint:\s*(\S+)/m)?.[1]?.replace(/["']/g, '')

// ── Runner finden ──────────────────────────────────────────────────────────
const candidates = [
  process.env.CONFORMANCE_RUNNER,
  resolve(root, '../plugin-template/tools/conformance/plugin-conformance.mjs'),
  resolve(root, '../../plugin-template/tools/conformance/plugin-conformance.mjs'),
].filter(Boolean)

const runner = candidates.find((p) => existsSync(p))

if (!runner) {
  console.error('✗ Konformitäts-Runner nicht gefunden.')
  console.error('  Gesucht an:')
  for (const c of candidates) console.error(`    ${c}`)
  console.error('')
  console.error('  Setz CONFORMANCE_RUNNER auf den Pfad, oder hol ihn aus der Basis:')
  console.error('    plugin-template/tools/conformance/plugin-conformance.mjs')
  console.error('')
  console.error('  ⚠️  Prüf den Hash, bevor du ihn ausführst — er steht daneben in der README.')
  console.error('      shasum -a 256 -c plugin-conformance.mjs.sha256')
  process.exit(2)
}

// ── Läuft der Dienst? ──────────────────────────────────────────────────────
let live = false
if (endpoint) {
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/plugin-bridge/v1/health`, {
      signal: AbortSignal.timeout(2000),
    })
    live = true
    if (res.status === 401 || res.status === 403) {
      console.log('⚠️  /health antwortet mit ' + res.status + ' — der Endpunkt muss TOKENFREI sein.')
      console.log('    Der Host pollt ihn, BEVOR er ein Token hat. Mit 401 schliesst er')
      console.log('    „nicht bereit" — dein Dienst läuft und wird nie als gesund erkannt.')
      console.log('    (Der Lauf geht trotzdem weiter, die Sicherheitshälfte wird gemessen.)')
      console.log('')
    }
  } catch {
    live = false
  }
}

// ── Lauf ───────────────────────────────────────────────────────────────────
const args = [runner, manifestPath]
if (live && endpoint) args.push('--endpoint', endpoint)

const r = spawnSync(process.execPath, args, { stdio: 'inherit' })

// ── Was NICHT gemessen wurde ───────────────────────────────────────────────
if (!live) {
  console.log('')
  console.log('━'.repeat(72))
  console.log('⚠️  DEIN DIENST LIEF NICHT — die Sicherheitshälfte ist UNGEMESSEN,')
  console.log('    nicht bestanden. Ein grünes Manifest sagt NICHTS über deine')
  console.log('    Token-Prüfung.')
  console.log('')
  console.log('    Beim ersten Cluster-Lauf lief genau ein Dienst — und dort haben')
  console.log('    ALLE DREI Abwehrprüfungen akzeptiert: die Bridge nahm jeden')
  console.log('    Bearer-Token ohne Verifikation an.')
  console.log('')
  console.log('    Starte deinen Dienst und ruf `pnpm check` erneut.')
  console.log('━'.repeat(72))
}

process.exit(r.status ?? 1)

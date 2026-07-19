// CLI-entry — runs argv-parse + scaffold + summary-print.
// Imported by bin/cli.js (compiled).

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ArgsError, HELP_TEXT, parseArgs, type ParsedArgs } from './args.js'
import { ScaffoldError, scaffold } from './scaffolders/scaffold.js'

type Foundation = typeof import('@nexus-mindgarden/plugin-bridge-foundation')

/**
 * Lädt bridge-foundation aus dem ZIEL-Plugin statt aus create-plugins eigenem
 * Baum. Zwei Gründe:
 *  - der gerenderte `manifest_hash` stammt dann garantiert aus derselben
 *    Foundation-Version, die dieses Plugin auch im `/health` ausliefert
 *    (sonst könnte er auseinanderlaufen und die Staleness-Erkennung lügen);
 *  - der Scaffold-Pfad (`npx create-plugin <name>`) zahlt nichts dafür —
 *    bridge-foundation ist hier nur devDependency (Typen), keine Laufzeit-Dep.
 */
async function loadFoundation(dir: string): Promise<Foundation> {
  const from = pathToFileURL(resolvePath(dir, 'package.json')).href
  const entry = createRequire(from).resolve('@nexus-mindgarden/plugin-bridge-foundation')
  return (await import(pathToFileURL(entry).href)) as Foundation
}

/**
 * `features-note` — manifest.<id>.yaml → Markdown-Feature-Katalog für die
 * Chatbus-Notes-Registry `repo/<role>/features` (Contract #6, rust-chatbus #7592).
 *
 * Der Bus-Append bleibt bewusst DRAUSSEN: `append_note` braucht Session-Identität
 * + die `supersedes`-Vorgänger-id. Deshalb: sauberes Markdown auf **stdout**,
 * ausnahmslos alle Diagnostik auf **stderr** — damit die Ausgabe pipebar bleibt.
 */
async function runFeaturesNote(parsed: ParsedArgs): Promise<number> {
  let foundation: Foundation
  try {
    foundation = await loadFoundation(parsed.dir)
  } catch {
    console.error(
      `error: '@nexus-mindgarden/plugin-bridge-foundation' ist von '${parsed.dir}' aus nicht auflösbar — ` +
        'features-note läuft im Repo eines Bridge-Plugins, wo die Foundation installiert ist.',
    )
    return 1
  }
  const { discoverManifest, computeManifestHash, renderFeaturesNote, ManifestError } = foundation

  let found
  try {
    found = await discoverManifest(parsed.dir, {
      warn: (m: string) => console.error(`warning: ${m}`),
    })
  } catch (err) {
    if (err instanceof ManifestError) {
      console.error(`error: ${err.message}`)
      return 1
    }
    throw err
  }

  const markdown = renderFeaturesNote(found.manifest, {
    manifestHash: computeManifestHash(found.manifest),
    sourceFilename: found.filename,
    deprecatedSource: found.deprecated,
  })

  if (parsed.out === '-') {
    process.stdout.write(markdown)
    return 0
  }

  try {
    writeFileSync(parsed.out, markdown, 'utf-8')
  } catch (err) {
    console.error(`error: konnte '${parsed.out}' nicht schreiben — ${(err as Error).message}`)
    return 1
  }
  console.error(
    `✓ ${parsed.out} — aus ${found.filename} (${found.manifest.id}@${found.manifest.version})`,
  )
  return 0
}

export async function runCli(argv: string[]): Promise<number> {
  let parsed
  try {
    parsed = parseArgs(argv)
  } catch (err) {
    if (err instanceof ArgsError) {
      console.error(`error: ${err.message}\n`)
      console.error(HELP_TEXT)
      return 1
    }
    throw err
  }

  if (parsed.help) {
    console.log(HELP_TEXT)
    return 0
  }

  if (parsed.command === 'features-note') {
    return runFeaturesNote(parsed)
  }

  console.log(`scaffolding plugin '${parsed.pluginName}' →  ${parsed.target}`)
  console.log(`  hosts:    ${parsed.hosts.join(', ')}`)
  console.log(`  features: ${parsed.features.join(', ')}`)
  console.log('')

  let result
  try {
    result = scaffold({
      pluginName: parsed.pluginName,
      hosts: parsed.hosts,
      features: parsed.features,
      target: parsed.target,
    })
  } catch (err) {
    if (err instanceof ScaffoldError) {
      console.error(`error: ${err.message}`)
      return 1
    }
    throw err
  }

  console.log(`✓ wrote ${result.filesWritten.length} files`)
  for (const f of result.filesWritten) console.log(`  ${f}`)
  console.log('')
  console.log(`done. next:`)
  console.log(`  cd ${parsed.target}`)
  console.log(`  pnpm install`)
  console.log(`  pnpm test`)
  console.log('')
  console.log(`docs:  https://github.com/MrDewitt88/plugin-template/blob/main/docs/PLUGIN-PROVIDER-GUIDE.md`)
  return 0
}
